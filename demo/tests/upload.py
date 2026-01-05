#!/usr/bin/env python3
"""图床上传工具 - 可上传指定图片"""

import requests
import os
import sys
from pathlib import Path

def load_env():
    # Prefer existing process env; otherwise load .env.local from repo root (or script dir)
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

def upload_image(image_path, api_key):
    url = "https://imageproxy.zhongzhuan.chat/api/upload"
    headers = {"Authorization": f"Bearer {api_key}"}

    with open(image_path, 'rb') as f:
        files = {'file': (os.path.basename(image_path), f)}
        response = requests.post(url, headers=headers, files=files, timeout=30)

    if response.status_code == 200:
        result = response.json()
        print(f"✓ 上传成功!")
        print(f"图片URL: {result['url']}")
        return result
    else:
        print(f"✗ 上传失败: {response.status_code}")
        print(f"响应: {response.text}")
        return None

def main():
    if not load_env():
        return

    api_key = (os.environ.get('YUNWU_API_KEY') or os.environ.get('YUNWU_ALL_KEY') or '').strip()
    if not api_key:
        print("错误: 未找到API密钥")
        print("请在环境变量或 .env.local 中设置 YUNWU_API_KEY 或 YUNWU_ALL_KEY")
        return

    image_path = sys.argv[1] if len(sys.argv) > 1 else "1.png"

    if not os.path.exists(image_path):
        print(f"错误: 文件不存在 - {image_path}")
        return

    print(f"上传图片: {image_path}")
    upload_image(image_path, api_key)

if __name__ == "__main__":
    main()
