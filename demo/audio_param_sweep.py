import argparse
import json
import math
import os
import random
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from audio_processing import get_duration, get_sample_rate, process_audio


@dataclass(frozen=True)
class Candidate:
    tempo: float
    stereo_delay_ms: float
    noise_dbfs: float


def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=False, capture_output=True, text=True)


def _ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def _parse_asdr(stderr: str) -> float:
    vals: list[float] = []
    for m in re.finditer(r"SDR ch\d+:\s+([+-]?(?:inf|nan|\d+(?:\.\d+)?))\s+dB", stderr):
        raw = m.group(1)
        if raw in ("inf", "+inf"):
            vals.append(float("inf"))
        elif raw == "nan":
            continue
        else:
            vals.append(float(raw))
    if not vals:
        raise RuntimeError("Failed to parse SDR from ffmpeg asdr output.")
    # Conservative: use the worst channel as the transparency bound.
    return float(min(vals))


def measure_sdr_db(ref_wav: str, deg_wav: str, *, trim_start_s: float) -> float:
    fg = (
        f"[0:a]atrim=start={trim_start_s:.3f},asetpts=N/SR/TB[a0];"
        f"[1:a]atrim=start={trim_start_s:.3f},asetpts=N/SR/TB[a1];"
        "[a0][a1]asdr"
    )
    proc = _run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostdin",
            "-i",
            ref_wav,
            "-i",
            deg_wav,
            "-filter_complex",
            fg,
            "-f",
            "null",
            "-",
        ]
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "ffmpeg asdr failed")
    return _parse_asdr(proc.stderr or "")


def _parse_astats_overall(stderr: str) -> dict:
    keys = {"Entropy", "Dynamic range", "Crest factor", "Zero crossings rate", "RMS level dB", "Peak level dB"}

    any_vals: dict[str, float] = {}
    overall_vals: dict[str, float] = {}

    in_overall = False
    for line in (stderr or "").splitlines():
        if line.endswith("] Overall"):
            in_overall = True
            continue

        m = re.search(r"\]\s+([^:]+):\s+([+-]?\d+(?:\.\d+)?)\s*$", line)
        if not m:
            if in_overall and not line.startswith("[Parsed_astats_"):
                in_overall = False
            continue

        k = m.group(1).strip()
        if k not in keys:
            continue

        v = float(m.group(2))
        any_vals[k] = v
        if in_overall:
            overall_vals[k] = v

    return overall_vals or any_vals


def measure_complexity_score(wav_path: str) -> tuple[float, dict]:
    proc = _run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostdin",
            "-i",
            wav_path,
            "-af",
            "astats=metadata=0:reset=0",
            "-f",
            "null",
            "-",
        ]
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "ffmpeg astats failed")
    stats = _parse_astats_overall(proc.stderr or "")

    entropy = float(stats.get("Entropy", 0.0))
    dyn = float(stats.get("Dynamic range", 0.0))
    crest = float(stats.get("Crest factor", 0.0))
    zcr = float(stats.get("Zero crossings rate", 0.0))

    # A simple "signal complexity" proxy:
    # - Entropy: higher -> more stochastic micro-structure
    # - Dynamic range: higher -> more micro-dynamics preserved
    # - ZCR: very weak proxy for HF activity (kept tiny weight)
    # - Crest: penalize excessive peaky-ness (often worsens codec behavior)
    score = (
        1.20 * entropy
        + 0.02 * dyn
        + 0.03 * math.log1p(max(0.0, zcr) * 1000.0)
        - 0.02 * max(0.0, crest - 2.5)
    )
    return score, stats


def simulate_distribution_aac_src(input_wav: str, out_wav: str, *, sample_rate: int, bitrate: str) -> None:
    with tempfile.TemporaryDirectory(prefix="aud_sweep_") as td:
        td_path = Path(td)
        encoded = td_path / "encoded.m4a"
        decoded = td_path / "decoded.wav"

        enc = _run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-nostdin",
                "-i",
                input_wav,
                "-af",
                "aresample=44100",
                "-c:a",
                "aac",
                "-b:a",
                bitrate,
                str(encoded),
            ]
        )
        if enc.returncode != 0:
            raise RuntimeError(enc.stderr.strip() or "ffmpeg AAC encode failed")

        dec = _run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-nostdin",
                "-i",
                str(encoded),
                "-af",
                f"aresample={sample_rate}",
                "-c:a",
                "pcm_s24le",
                str(decoded),
            ]
        )
        if dec.returncode != 0:
            raise RuntimeError(dec.stderr.strip() or "ffmpeg AAC decode failed")

        os.replace(decoded, out_wav)


def odg_proxy_from_sdr(sdr_db: float) -> float:
    # Map SDR(dB) -> ~ODG range [-4, 0] as a proxy (NOT real PEAQ ODG).
    if math.isinf(sdr_db):
        return 0.0
    # 60 dB -> 0, 40 dB -> about -2, 30 dB -> about -3
    odg = (sdr_db - 60.0) / 10.0
    return float(max(-4.0, min(0.0, odg)))


def iter_candidates(*, rng: random.Random, n: int) -> list[Candidate]:
    out: list[Candidate] = []
    for _ in range(n):
        tempo = 1.0 + rng.uniform(-6e-4, 6e-4)  # ±0.06%: micro varispeed
        stereo_delay_ms = rng.uniform(-0.02, 0.02)  # ±20 µs inter-channel delay
        noise_dbfs = rng.uniform(-96.0, -72.0)  # entropy injection strength
        out.append(Candidate(tempo=tempo, stereo_delay_ms=stereo_delay_ms, noise_dbfs=noise_dbfs))
    return out


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Parameter sweep for distribution-optimal redundancy simulation")
    p.add_argument("input_file", help="Input audio file")
    p.add_argument("--out-dir", default="demo/out/audio_sweep", help="Output directory")
    p.add_argument("--target-lufs", type=float, default=-14.0, help="Target integrated loudness (LUFS)")
    p.add_argument("--target-tp", type=float, default=-1.5, help="True peak limit (dBTP)")
    p.add_argument("--target-lra", type=float, default=11.0, help="Target loudness range (LRA)")
    p.add_argument("--aac-bitrate", default="128k", help="AAC bitrate for platform simulation (e.g. 96k/128k/192k)")
    p.add_argument("--candidates", type=int, default=24, help="Number of candidates to try")
    p.add_argument("--seed", type=int, default=7, help="Random seed")
    p.add_argument("--min-odg-proxy", type=float, default=-0.2, help="Minimum ODG proxy (mapped from SDR, not real ODG)")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    in_path = str(args.input_file)
    out_dir = Path(args.out_dir)
    _ensure_dir(out_dir)

    sample_rate = get_sample_rate(in_path)
    duration = get_duration(in_path)
    trim_start_s = 0.0 if duration <= 2.0 else min(0.75, duration * 0.08)

    rng = random.Random(int(args.seed))
    candidates = iter_candidates(rng=rng, n=int(args.candidates))

    results_path = out_dir / "results.jsonl"
    best_path = out_dir / "best.json"

    best: dict | None = None

    with tempfile.TemporaryDirectory(prefix="aud_sweep_work_") as td:
        work = Path(td)

        with results_path.open("w", encoding="utf-8") as fp:
            for idx, cand in enumerate(candidates, start=1):
                processed = work / f"cand_{idx:04d}_pro.wav"
                degraded = work / f"cand_{idx:04d}_deg.wav"

                process_audio(
                    in_path,
                    str(processed),
                    target_i_lufs=float(args.target_lufs),
                    target_tp_db=float(args.target_tp),
                    target_lra=float(args.target_lra),
                    tempo=cand.tempo,
                    enable_time_fluctuation=False,
                    ms_side_gain=0.95,
                    stereo_delay_ms=cand.stereo_delay_ms,
                    stereo_phase_deg=0.0,
                    noise_dbfs=cand.noise_dbfs,
                    noise_color="pink",
                    noise_highpass_hz=12000.0,
                    noise_lowpass_hz=19000.0,
                )

                simulate_distribution_aac_src(
                    str(processed),
                    str(degraded),
                    sample_rate=sample_rate,
                    bitrate=str(args.aac_bitrate),
                )

                sdr_db = measure_sdr_db(str(processed), str(degraded), trim_start_s=trim_start_s)
                odg_proxy = odg_proxy_from_sdr(sdr_db)
                complexity, complexity_stats = measure_complexity_score(str(processed))

                row = {
                    "idx": idx,
                    "candidate": {"tempo": cand.tempo, "stereo_delay_ms": cand.stereo_delay_ms, "noise_dbfs": cand.noise_dbfs},
                    "platform_sim": {"aac_bitrate": str(args.aac_bitrate), "src": "44.1k -> original"},
                    "metrics": {"sdr_db": sdr_db, "odg_proxy": odg_proxy, "complexity": complexity, "complexity_stats": complexity_stats},
                }
                fp.write(json.dumps(row, ensure_ascii=False) + "\n")
                fp.flush()

                if odg_proxy < float(args.min_odg_proxy):
                    continue

                if best is None or float(row["metrics"]["complexity"]) > float(best["metrics"]["complexity"]):
                    best = row

    if best is None:
        raise SystemExit(f"No candidates met min_odg_proxy={args.min_odg_proxy}. See {results_path}")

    best_path.write_text(json.dumps(best, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Best params written: {best_path}")
    print(f"All results written: {results_path}")


if __name__ == "__main__":
    main()
