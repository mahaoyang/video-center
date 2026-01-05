#!/usr/bin/env python3
"""
图床上传API测试 - 最终版本
从.env.local读取API密钥，确保安全
"""

import requests
import os
from pathlib import Path

def load_env():
    """从.env.local加载环境变量"""
    candidates = [
        Path(__file__).resolve().parents[2] / '.env.local',  # repo root
        Path(__file__).parent / '.env.local',
    ]
    for env_file in candidates:
        if not env_file.exists():
            continue

        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key] = value.strip().strip('"').strip("'")
        return True

    return True

def create_test_image(filename="test.png"):
    """创建1x1像素的测试PNG图片"""
    png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    with open(filename, 'wb') as f:
        f.write(png_data)
    return filename

def upload_image(image_path, api_key):
    """上传图片到图床API"""
    url = "https://imageproxy.zhongzhuan.chat/api/upload"
    headers = {"Authorization": f"Bearer {api_key}"}

    print(f"上传图片: {image_path}")
    print(f"API端点: {url}\n")

    try:
        with open(image_path, 'rb') as f:
            files = {'file': (os.path.basename(image_path), f, 'image/png')}
            response = requests.post(url, headers=headers, files=files, timeout=10)

        print(f"状态码: {response.status_code}")
        print(f"响应: {response.text}\n")

        if response.status_code == 200:
            try:
                result = response.json()
                print("✓ 上传成功!")
                print(f"结果: {result}")
                return result
            except:
                print("✗ 返回200但不是JSON格式（可能是HTML页面）")
        else:
            print("✗ 上传失败")
            print("\n注意: 根据测试，该API端点可能不可用。")
            print("请查看 README_TEST.md 了解详细测试结果。")

    except Exception as e:
        print(f"✗ 请求错误: {e}")

    return None

def main():
    print("=" * 60)
    print("图床上传API测试")
    print("=" * 60 + "\n")

    # 加载环境变量
    if not load_env():
        return

    api_key = (os.environ.get('YUNWU_API_KEY') or os.environ.get('YUNWU_ALL_KEY') or '').strip()
    if not api_key:
        print("错误: 未找到 API Key")
        print("请在环境变量或 .env.local 中设置 YUNWU_API_KEY 或 YUNWU_ALL_KEY")
        return

    print("✓ API密钥已加载\n")

    # 创建测试图片
    print("创建测试图片...")
    test_img = create_test_image()
    print(f"✓ 已创建: {test_img}\n")

    # 上传测试
    print("-" * 60)
    upload_image(test_img, api_key)
    print("-" * 60)

if __name__ == "__main__":
    main()
