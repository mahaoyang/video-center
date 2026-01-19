import argparse


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="demo", description="Video Center demo entrypoint")
    sub = parser.add_subparsers(dest="command")

    audio = sub.add_parser("audio", help="Process audio with ffmpeg filters")
    audio.add_argument("input_file", help="Input audio file (e.g., input.wav)")
    audio.add_argument("output_file", help="Output audio file (e.g., output_pro.wav)")
    audio.add_argument("--target-lufs", type=float, default=-16.0, help="Target integrated loudness in LUFS (default: -16)")
    audio.add_argument("--target-tp", type=float, default=-1.5, help="True peak limit in dBTP (default: -1.5)")
    audio.add_argument("--target-lra", type=float, default=11.0, help="Target loudness range (default: 11)")
    audio.add_argument("--tempo", type=float, default=1.0003, help="Micro varispeed factor (default: 1.0003)")
    audio.add_argument("--enable-time-fluctuation", action="store_true", help="Enable ultra-subtle fullband vibrato (jitter sim)")
    audio.add_argument("--time-fluctuation-freq", type=float, default=0.25, help="Time fluctuation freq in Hz (default: 0.25)")
    audio.add_argument("--time-fluctuation-depth", type=float, default=0.00001, help="Time fluctuation depth (vibrato d: 0..1, default: 0.00001)")
    audio.add_argument("--ms-side-gain", type=float, default=0.95, help="M/S Side gain (default: 0.95)")
    audio.add_argument("--stereo-delay-ms", type=float, default=0.0, help="Inter-channel delay in ms (default: 0.0)")
    audio.add_argument("--stereo-phase-deg", type=float, default=0.0, help="Stereo phase in degrees (default: 0.0)")
    audio.add_argument("--noise-dbfs", type=float, default=None, help="Entropy injection noise level in dBFS (e.g. -84). Omit to disable.")
    audio.add_argument("--noise-color", default="pink", help="Noise color: white/pink/brown/blue/violet/velvet (default: pink)")
    audio.add_argument("--noise-highpass-hz", type=float, default=12000.0, help="Noise highpass in Hz (default: 12000)")
    audio.add_argument("--noise-lowpass-hz", type=float, default=19000.0, help="Noise lowpass in Hz (default: 19000)")
    audio.add_argument("--exciter", action="store_true", help="Enable subtle harmonic enhancement (aexciter)")
    audio.add_argument("--exciter-amount", type=float, default=0.35, help="aexciter amount (default: 0.35)")
    audio.add_argument("--exciter-drive", type=float, default=1.6, help="aexciter drive (default: 1.6)")
    audio.add_argument("--exciter-blend", type=float, default=0.3, help="aexciter blend (default: 0.3)")
    audio.add_argument("--exciter-freq", type=float, default=7000, help="aexciter freq in Hz (default: 7000)")

    sweep = sub.add_parser("audio-sweep", help="Sweep redundancy-sim parameters for streaming distribution")
    sweep.add_argument("input_file", help="Input audio file")
    sweep.add_argument("--out-dir", default="demo/out/audio_sweep", help="Output directory")
    sweep.add_argument("--target-lufs", type=float, default=-14.0, help="Target integrated loudness (LUFS)")
    sweep.add_argument("--target-tp", type=float, default=-1.5, help="True peak limit (dBTP)")
    sweep.add_argument("--target-lra", type=float, default=11.0, help="Target loudness range (LRA)")
    sweep.add_argument("--aac-bitrate", default="128k", help="AAC bitrate for platform simulation")
    sweep.add_argument("--candidates", type=int, default=24, help="Number of candidates to try")
    sweep.add_argument("--seed", type=int, default=7, help="Random seed")
    sweep.add_argument("--min-odg-proxy", type=float, default=-0.2, help="Minimum ODG proxy (mapped from SDR, not real ODG)")

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    if args.command == "audio":
        from audio_processing import process_audio

        process_audio(
            args.input_file,
            args.output_file,
            target_i_lufs=args.target_lufs,
            target_tp_db=args.target_tp,
            target_lra=args.target_lra,
            tempo=args.tempo,
            enable_time_fluctuation=bool(args.enable_time_fluctuation),
            time_fluctuation_freq_hz=args.time_fluctuation_freq,
            time_fluctuation_depth=args.time_fluctuation_depth,
            ms_side_gain=args.ms_side_gain,
            stereo_delay_ms=args.stereo_delay_ms,
            stereo_phase_deg=args.stereo_phase_deg,
            noise_dbfs=args.noise_dbfs,
            noise_color=args.noise_color,
            noise_highpass_hz=args.noise_highpass_hz,
            noise_lowpass_hz=args.noise_lowpass_hz,
            enable_exciter=args.exciter,
            exciter_amount=args.exciter_amount,
            exciter_drive=args.exciter_drive,
            exciter_blend=args.exciter_blend,
            exciter_freq=args.exciter_freq,
        )
        return

    if args.command == "audio-sweep":
        from audio_param_sweep import main as sweep_main

        sweep_argv = [
            args.input_file,
            "--out-dir",
            args.out_dir,
            "--target-lufs",
            str(args.target_lufs),
            "--target-tp",
            str(args.target_tp),
            "--target-lra",
            str(args.target_lra),
            "--aac-bitrate",
            str(args.aac_bitrate),
            "--candidates",
            str(args.candidates),
            "--seed",
            str(args.seed),
            "--min-odg-proxy",
            str(args.min_odg_proxy),
        ]
        sweep_main(sweep_argv)
        return

    print("Hello from demo!")


if __name__ == "__main__":
    main()
