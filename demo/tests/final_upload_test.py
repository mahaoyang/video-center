#!/usr/bin/env python3
import requests
import os

def upload_image_final(image_path="1.png"):
    """使用正确的端点上传图片"""
    url = "https://yunwu.ai/upload"

    token = (os.getenv("YUNWU_API_KEY") or os.getenv("YUNWU_ALL_KEY") or "").strip()
    if not token:
        raise RuntimeError("Missing token: set YUNWU_API_KEY or YUNWU_ALL_KEY")

    headers = {
        "Authorization": f"Bearer {token}"
    }

    print(f"上传图片: {image_path}")
    print(f"端点: {url}\n")

    with open(image_path, 'rb') as f:
        files = {'file': (image_path, f, 'image/png')}
        response = requests.post(url, headers=headers, files=files)

    print(f"状态码: {response.status_code}")
    print(f"Content-Type: {response.headers.get('Content-Type')}")
    print(f"\n完整响应:")
    print(response.text)

    # 尝试解析JSON
    try:
        result = response.json()
        print(f"\nJSON解析成功:")
        print(result)
        return result
    except:
        print(f"\n无法解析为JSON，可能返回的是HTML页面")
        return None

if __name__ == "__main__":
    upload_image_final()
