#!/usr/bin/env python3
import requests
import os

def test_upload_endpoints(image_path="1.png"):
    """测试多个可能的上传端点"""
    endpoints = [
        "https://yunwu.ai/api/upload",
        "https://yunwu.ai/upload",
        "https://yunwu.ai/v1/upload",
        "https://yunwu.ai/api/v1/upload",
        "https://api.yunwu.ai/upload",
        "https://api.yunwu.ai/v1/upload",
    ]

    token = (os.getenv("YUNWU_API_KEY") or os.getenv("YUNWU_ALL_KEY") or "").strip()
    if not token:
        raise RuntimeError("Missing token: set YUNWU_API_KEY or YUNWU_ALL_KEY")
    headers = {
        "Authorization": f"Bearer {token}"
    }

    if not os.path.exists(image_path):
        print(f"图片文件不存在: {image_path}")
        return

    for url in endpoints:
        print(f"\n测试端点: {url}")
        try:
            with open(image_path, 'rb') as f:
                files = {'file': f}
                response = requests.post(url, headers=headers, files=files, timeout=10)

            print(f"  状态码: {response.status_code}")
            ct = response.headers.get("Content-Type", "")
            preview = response.text[:200].replace("\n", "\\n")
            print(f"  Content-Type: {ct}")
            print(f"  响应预览: {preview}")

            if response.status_code == 200:
                try:
                    data = response.json()
                except Exception:
                    print("  备注: 200 但不是 JSON（可能是网页，不是上传 API）")
                    continue

                print(f"\n✓ 成功! 使用端点: {url}")
                return data

        except Exception as e:
            print(f"  错误: {e}")

    print("\n所有端点测试失败")
    return None

if __name__ == "__main__":
    result = test_upload_endpoints()
    if result:
        print(f"\n最终结果: {result}")
