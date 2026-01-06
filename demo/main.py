import argparse


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="demo", description="Video Center demo entrypoint")
    sub = parser.add_subparsers(dest="command")

    audio = sub.add_parser("audio", help="Process audio with ffmpeg filters")
    audio.add_argument("input_file", help="Input audio file (e.g., input.wav)")
    audio.add_argument("output_file", help="Output audio file (e.g., output_pro.wav)")
    audio.add_argument("--exciter", action="store_true", help="Enable subtle harmonic enhancement (aexciter)")
    audio.add_argument("--exciter-amount", type=float, default=0.35, help="aexciter amount (default: 0.35)")
    audio.add_argument("--exciter-drive", type=float, default=1.6, help="aexciter drive (default: 1.6)")
    audio.add_argument("--exciter-blend", type=float, default=0.3, help="aexciter blend (default: 0.3)")
    audio.add_argument("--exciter-freq", type=float, default=7000, help="aexciter freq in Hz (default: 7000)")

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    if args.command == "audio":
        from audio_processing import process_audio

        process_audio(
            args.input_file,
            args.output_file,
            enable_exciter=args.exciter,
            exciter_amount=args.exciter_amount,
            exciter_drive=args.exciter_drive,
            exciter_blend=args.exciter_blend,
            exciter_freq=args.exciter_freq,
        )
        return

    print("Hello from demo!")


if __name__ == "__main__":
    main()
