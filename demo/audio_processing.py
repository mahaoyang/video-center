import argparse
import json
import re
import subprocess


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


def _build_filtergraph(
    *,
    tempo: float,
    sample_rate: int,
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
    return (
        "[0:a]"
        + _tempo_filter(tempo)
        + "aformat=channel_layouts=stereo,"
        + "highpass=f=20,"
        + "lowpass=f=19500,"
        + "firequalizer=gain='if(gt(f,16000),-0.8,0)',"
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
        + "vibrato=f=0.3:d=0.00002,"
        + "volume=0.95[side];"
        + "[mid][side]join=inputs=2:channel_layout=stereo[ms];"
        + f"[ms]pan=stereo|c0=c0+c1|c1=c0-c1,aresample={sample_rate},"
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
    enable_exciter: bool,
    exciter_amount: float,
    exciter_drive: float,
    exciter_blend: float,
    exciter_freq: float,
) -> dict:
    filtergraph = _build_filtergraph(
        tempo=tempo,
        sample_rate=sample_rate,
        enable_exciter=enable_exciter,
        exciter_amount=exciter_amount,
        exciter_drive=exciter_drive,
        exciter_blend=exciter_blend,
        exciter_freq=exciter_freq,
        add_loudnorm="loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
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
        "loudnorm=I=-16:TP=-1.5:LRA=11:"
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
    enable_exciter: bool = False,
    exciter_amount: float = 0.35,
    exciter_drive: float = 1.6,
    exciter_blend: float = 0.3,
    exciter_freq: float = 7000,
) -> None:
    _ = get_duration(input_file)  # keep ffprobe in the demo for quick validation
    sample_rate = get_sample_rate(input_file)
    tempo = 1.0003

    measure = _analyze_loudnorm(
        input_file,
        tempo=tempo,
        sample_rate=sample_rate,
        enable_exciter=enable_exciter,
        exciter_amount=exciter_amount,
        exciter_drive=exciter_drive,
        exciter_blend=exciter_blend,
        exciter_freq=exciter_freq,
    )
    loudnorm_second_pass = _format_loudnorm_second_pass(measure)
    filter_chain = _build_filtergraph(
        tempo=tempo,
        sample_rate=sample_rate,
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
