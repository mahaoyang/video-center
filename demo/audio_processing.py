import argparse
import json
import re
import subprocess


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def get_duration(input_file: str) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        input_file,
    ]
    output = subprocess.check_output(cmd)
    return float(output)


def get_sample_rate(input_file: str) -> int:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=sample_rate",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        input_file,
    ]
    output = subprocess.check_output(cmd)
    return int(output)


def _ffmpeg_has_filter(filter_name: str) -> bool:
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-h", f"filter={filter_name}"],
        check=False,
        capture_output=True,
        text=True,
    )
    output = (proc.stdout or "") + (proc.stderr or "")
    return ("Unknown filter" not in output) and ("No such filter" not in output)


def _tempo_filter(tempo: float) -> str:
    if abs(tempo - 1.0) < 1e-9:
        return ""
    if _ffmpeg_has_filter("rubberband"):
        return f"rubberband=tempo={tempo:.7f},"
    return f"atempo={tempo:.7f},"


def _aexciter_filter(
    *,
    enabled: bool,
    amount: float,
    drive: float,
    blend: float,
    freq: float,
    ceil: float,
) -> str:
    if not enabled:
        return ""
    if not _ffmpeg_has_filter("aexciter"):
        return ""
    return (
        f"aexciter=level_in=1:level_out=1:amount={amount}:drive={drive}:blend={blend}:"
        f"freq={freq}:ceil={ceil},"
    )


def _vibrato_filter(*, enabled: bool, freq_hz: float, depth: float) -> str:
    if not enabled:
        return ""
    if depth <= 0:
        return ""
    if not _ffmpeg_has_filter("vibrato"):
        return ""
    freq_hz = _clamp(freq_hz, 0.1, 20000.0)
    depth = _clamp(depth, 0.0, 1.0)
    return f"vibrato=f={freq_hz:.6f}:d={depth:.8f},"


def _stereo_phase_filter(*, delay_ms: float, phase_deg: float) -> str:
    if abs(delay_ms) < 1e-12 and abs(phase_deg) < 1e-12:
        return ""
    if not _ffmpeg_has_filter("stereotools"):
        return ""

    parts: list[str] = []
    if abs(delay_ms) >= 1e-12:
        parts.append(f"delay={_clamp(delay_ms, -20.0, 20.0):.9f}")
    if abs(phase_deg) >= 1e-12:
        parts.append(f"phase={_clamp(phase_deg, 0.0, 360.0):.9f}")
    if not parts:
        return ""
    return f"stereotools={':'.join(parts)},"


def _noise_amp_from_dbfs(noise_dbfs: float) -> float:
    # anoisesrc amplitude is linear in [0, 1]
    return float(10 ** (noise_dbfs / 20.0))


def _build_filtergraph(
    *,
    tempo: float,
    sample_rate: int,
    # Adaptive time-domain fluctuation simulation
    enable_time_fluctuation: bool,
    time_fluctuation_freq_hz: float,
    time_fluctuation_depth: float,
    # Cross-channel dynamic phase management
    ms_side_gain: float,
    stereo_delay_ms: float,
    stereo_phase_deg: float,
    # High-order statistical entropy injection
    noise_dbfs: float | None,
    noise_color: str,
    noise_highpass_hz: float,
    noise_lowpass_hz: float,
    enable_exciter: bool,
    exciter_amount: float,
    exciter_drive: float,
    exciter_blend: float,
    exciter_freq: float,
    add_loudnorm: str,
) -> str:
    # Notes:
    # - Keep processing as close to transparent as possible.
    # - Do M/S only for a tiny HF-only Side modulation (Mid stays LTI).
    ms_side_gain = _clamp(ms_side_gain, 0.0, 4.0)
    base = (
        "[0:a]"
        + _tempo_filter(tempo)
        + "aformat=channel_layouts=stereo,"
        + "highpass=f=20,"
        + "lowpass=f=19500,"
        + "firequalizer=gain='if(gt(f,16000),-0.8,0)',"
        + _vibrato_filter(
            enabled=enable_time_fluctuation,
            freq_hz=time_fluctuation_freq_hz,
            depth=time_fluctuation_depth,
        )
        + _aexciter_filter(
            enabled=enable_exciter,
            amount=exciter_amount,
            drive=exciter_drive,
            blend=exciter_blend,
            freq=exciter_freq,
            ceil=19500,
        )
        + "acompressor=threshold=0.1:ratio=1.15:attack=25:release=250:knee=2,"
        + "asplit[m1][m2];"
        + "[m1]pan=1c|c0=0.5*c0+0.5*c1[mid];"
        + "[m2]pan=1c|c0=0.5*c0-0.5*c1,"
        + "highpass=f=5000,"
        + _vibrato_filter(enabled=True, freq_hz=0.3, depth=0.00002)
        + f"volume={ms_side_gain:.6f}[side];"
        + "[mid][side]join=inputs=2:channel_layout=stereo[ms];"
        + f"[ms]pan=stereo|c0=c0+c1|c1=c0-c1,"
        + _stereo_phase_filter(delay_ms=stereo_delay_ms, phase_deg=stereo_phase_deg)
        + f"aresample={sample_rate}"
    )

    if noise_dbfs is None:
        return base + "," + add_loudnorm

    amp = _noise_amp_from_dbfs(noise_dbfs)
    amp = _clamp(amp, 0.0, 1.0)

    # Note: anoisesrc defaults to mono; we upmix to stereo via pan.
    # We band-limit the injected entropy to a controlled range.
    noise_color = (noise_color or "pink").strip().lower()
    color_map = {
        "white": "white",
        "pink": "pink",
        "brown": "brown",
        "blue": "blue",
        "violet": "violet",
        "velvet": "velvet",
    }
    color = color_map.get(noise_color, "pink")

    hp = _clamp(float(noise_highpass_hz), 0.0, sample_rate / 2.0)
    lp = _clamp(float(noise_lowpass_hz), 0.0, sample_rate / 2.0)
    if lp and hp and lp <= hp:
        lp = _clamp(hp + 10.0, 0.0, sample_rate / 2.0)

    n_hp = "" if hp <= 1e-9 else f"highpass=f={hp:.3f},"
    n_lp = "" if lp <= 1e-9 else f"lowpass=f={lp:.3f},"
    return (
        f"{base}[a];"
        f"anoisesrc=r={sample_rate}:a={amp:.10f}:c={color}[n0];"
        f"[n0]{n_hp}{n_lp}pan=stereo|c0=c0|c1=c0[n];"
        f"[a][n]amix=inputs=2:duration=first:normalize=0,"
        + add_loudnorm
    )


def _parse_loudnorm_json(stderr: str) -> dict:
    matches = re.findall(r"\{[\s\S]*?\}", stderr)
    if not matches:
        raise RuntimeError("Failed to find loudnorm JSON in ffmpeg output.")
    return json.loads(matches[-1])


def _analyze_loudnorm(
    input_file: str,
    *,
    tempo: float,
    sample_rate: int,
    enable_time_fluctuation: bool,
    time_fluctuation_freq_hz: float,
    time_fluctuation_depth: float,
    ms_side_gain: float,
    stereo_delay_ms: float,
    stereo_phase_deg: float,
    noise_dbfs: float | None,
    noise_color: str,
    noise_highpass_hz: float,
    noise_lowpass_hz: float,
    enable_exciter: bool,
    exciter_amount: float,
    exciter_drive: float,
    exciter_blend: float,
    exciter_freq: float,
    target_i_lufs: float,
    target_tp_db: float,
    target_lra: float,
) -> dict:
    filtergraph = _build_filtergraph(
        tempo=tempo,
        sample_rate=sample_rate,
        enable_time_fluctuation=enable_time_fluctuation,
        time_fluctuation_freq_hz=time_fluctuation_freq_hz,
        time_fluctuation_depth=time_fluctuation_depth,
        ms_side_gain=ms_side_gain,
        stereo_delay_ms=stereo_delay_ms,
        stereo_phase_deg=stereo_phase_deg,
        noise_dbfs=noise_dbfs,
        noise_color=noise_color,
        noise_highpass_hz=noise_highpass_hz,
        noise_lowpass_hz=noise_lowpass_hz,
        enable_exciter=enable_exciter,
        exciter_amount=exciter_amount,
        exciter_drive=exciter_drive,
        exciter_blend=exciter_blend,
        exciter_freq=exciter_freq,
        add_loudnorm=f"loudnorm=I={target_i_lufs}:TP={target_tp_db}:LRA={target_lra}:print_format=json",
    )
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-nostdin",
        "-i",
        input_file,
        "-filter_complex",
        filtergraph,
        "-f",
        "null",
        "-",
    ]
    proc = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "ffmpeg loudnorm analysis failed")
    return _parse_loudnorm_json(proc.stderr)


def _format_loudnorm_second_pass(measure: dict) -> str:
    required = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"]
    missing = [k for k in required if k not in measure]
    if missing:
        raise RuntimeError(f"loudnorm JSON missing keys: {missing}")

    def f(key: str) -> str:
        return f"{float(measure[key]):.6f}"

    return (
        f"loudnorm=I={float(measure.get('_target_i_lufs', -16.0))}:"
        f"TP={float(measure.get('_target_tp_db', -1.5))}:"
        f"LRA={float(measure.get('_target_lra', 11.0))}:"
        f"measured_I={f('input_i')}:"
        f"measured_TP={f('input_tp')}:"
        f"measured_LRA={f('input_lra')}:"
        f"measured_thresh={f('input_thresh')}:"
        f"offset={f('target_offset')}:"
        "print_format=summary"
    )


def process_audio(
    input_file: str,
    output_file: str,
    *,
    target_i_lufs: float = -16.0,
    target_tp_db: float = -1.5,
    target_lra: float = 11.0,
    tempo: float = 1.0003,
    enable_time_fluctuation: bool = False,
    time_fluctuation_freq_hz: float = 0.25,
    time_fluctuation_depth: float = 0.00001,
    ms_side_gain: float = 0.95,
    stereo_delay_ms: float = 0.0,
    stereo_phase_deg: float = 0.0,
    noise_dbfs: float | None = None,
    noise_color: str = "pink",
    noise_highpass_hz: float = 12000.0,
    noise_lowpass_hz: float = 19000.0,
    enable_exciter: bool = False,
    exciter_amount: float = 0.35,
    exciter_drive: float = 1.6,
    exciter_blend: float = 0.3,
    exciter_freq: float = 7000,
) -> None:
    _ = get_duration(input_file)  # keep ffprobe in the demo for quick validation
    sample_rate = get_sample_rate(input_file)

    measure = _analyze_loudnorm(
        input_file,
        tempo=tempo,
        sample_rate=sample_rate,
        enable_time_fluctuation=enable_time_fluctuation,
        time_fluctuation_freq_hz=time_fluctuation_freq_hz,
        time_fluctuation_depth=time_fluctuation_depth,
        ms_side_gain=ms_side_gain,
        stereo_delay_ms=stereo_delay_ms,
        stereo_phase_deg=stereo_phase_deg,
        noise_dbfs=noise_dbfs,
        noise_color=noise_color,
        noise_highpass_hz=noise_highpass_hz,
        noise_lowpass_hz=noise_lowpass_hz,
        enable_exciter=enable_exciter,
        exciter_amount=exciter_amount,
        exciter_drive=exciter_drive,
        exciter_blend=exciter_blend,
        exciter_freq=exciter_freq,
        target_i_lufs=target_i_lufs,
        target_tp_db=target_tp_db,
        target_lra=target_lra,
    )
    measure["_target_i_lufs"] = float(target_i_lufs)
    measure["_target_tp_db"] = float(target_tp_db)
    measure["_target_lra"] = float(target_lra)
    loudnorm_second_pass = _format_loudnorm_second_pass(measure)
    filter_chain = _build_filtergraph(
        tempo=tempo,
        sample_rate=sample_rate,
        enable_time_fluctuation=enable_time_fluctuation,
        time_fluctuation_freq_hz=time_fluctuation_freq_hz,
        time_fluctuation_depth=time_fluctuation_depth,
        ms_side_gain=ms_side_gain,
        stereo_delay_ms=stereo_delay_ms,
        stereo_phase_deg=stereo_phase_deg,
        noise_dbfs=noise_dbfs,
        noise_color=noise_color,
        noise_highpass_hz=noise_highpass_hz,
        noise_lowpass_hz=noise_lowpass_hz,
        enable_exciter=enable_exciter,
        exciter_amount=exciter_amount,
        exciter_drive=exciter_drive,
        exciter_blend=exciter_blend,
        exciter_freq=exciter_freq,
        add_loudnorm=loudnorm_second_pass,
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-nostdin",
        "-i",
        input_file,
        "-filter_complex",
        filter_chain,
        "-c:a",
        "pcm_s24le",
        "-ar",
        str(sample_rate),
        output_file,
    ]

    subprocess.run(cmd, check=True)
    print(f"处理完成: {output_file}")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Process audio with ffmpeg filters")
    parser.add_argument("input_file", help="Input audio file (e.g., input.wav)")
    parser.add_argument("output_file", help="Output audio file (e.g., output_pro.wav)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    process_audio(args.input_file, args.output_file)


if __name__ == "__main__":
    main()
