#!/usr/bin/env python3
"""测试多个可能的图床上传端点"""

import requests
import os
from pathlib import Path

def load_env():
    env_file = Path(__file__).parent / '.env.local'
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key] = value

def create_test_image():
    png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    with open('test.png', 'wb') as f:
        f.write(png_data)
    return 'test.png'

def test_endpoints():
    load_env()
    api_key = os.environ.get('YUNWU_API_KEY')

    if not api_key:
        print("错误: 未找到API密钥")
        return

    test_img = create_test_image()

    endpoints = [
        "/api/upload",
        "/upload",
        "/image/upload",
        "/file/upload",
        "/v1/upload",
        "/api/v1/upload",
        "/api/image/upload",
        "/api/file/upload",
    ]

    headers = {"Authorization": f"Bearer {api_key}"}

    for path in endpoints:
        url = f"https://yunwu.ai{path}"
        print(f"\n测试: {url}")

        try:
            with open(test_img, 'rb') as f:
                files = {'file': ('test.png', f, 'image/png')}
                response = requests.post(url, headers=headers, files=files, timeout=5)

            print(f"  状态: {response.status_code}")

            if response.status_code == 200:
                try:
                    result = response.json()
                    print(f"  ✓ 成功! 响应: {result}")
                    return url, result
                except:
                    print(f"  响应: {response.text[:100]}")
            else:
                print(f"  响应: {response.text[:100]}")

        except Exception as e:
            print(f"  错误: {e}")

    print("\n所有端点测试失败")
    return None

if __name__ == "__main__":
    test_endpoints()
