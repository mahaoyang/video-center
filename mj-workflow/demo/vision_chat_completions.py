import json
import os
import sys

import requests


def env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    return value if value is not None else default


def main() -> int:
    api_url = (env("LLM_API_URL") or env("MJ_API_URL") or "https://yunwu.ai").rstrip("/")
    token = env("LLM_API_TOKEN") or env("MJ_API_TOKEN")
    model = env("VISION_MODEL") or "claude-sonnet-4-5-20250929"

    image_url = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
    )
    question = sys.argv[2] if len(sys.argv) > 2 else "这张图片里有什么?请详细描述。"
    if len(sys.argv) > 3:
        model = sys.argv[3]

    if not token:
        raise RuntimeError("Missing token: set LLM_API_TOKEN or MJ_API_TOKEN in .env(.local)")

    url = f"{api_url}/v1/chat/completions"
    payload = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a helpful assistant."},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": question},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                },
            ],
        }
    )
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    response = requests.request("POST", url, headers=headers, data=payload, timeout=60)
    print(response.text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

