#!/usr/bin/env python3
import requests
import os

# 创建一个简单的测试图片（1x1像素的PNG）
def create_test_image(filename="test_image.png"):
    # 最小的有效PNG文件（1x1像素，红色）
    png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    with open(filename, 'wb') as f:
        f.write(png_data)
    print(f"创建测试图片: {filename}")
    return filename

# 上传图片
def upload_image(image_path):
    url = "https://yunwu.ai/api/upload"
    token = (os.getenv("YUNWU_API_KEY") or os.getenv("YUNWU_ALL_KEY") or "").strip()
    if not token:
        raise RuntimeError("Missing token: set YUNWU_API_KEY or YUNWU_ALL_KEY")
    headers = {
        "Authorization": f"Bearer {token}"
    }

    with open(image_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(url, headers=headers, files=files)

    print(f"状态码: {response.status_code}")
    print(f"响应: {response.text}")

    if response.status_code == 200:
        return response.json()
    return None

if __name__ == "__main__":
    # 创建测试图片
    test_img = create_test_image()

    # 上传图片
    result = upload_image(test_img)

    if result:
        print("\n上传成功!")
        print(result)
