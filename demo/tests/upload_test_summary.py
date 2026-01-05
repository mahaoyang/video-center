#!/usr/bin/env python3
"""
图床上传API测试总结

根据Apifox文档 (https://yunwu.apifox.cn/api-356192326)，
图床上传API应该是：
- URL: https://yunwu.ai/api/upload
- Method: POST
- Headers: Authorization: Bearer <token>
- Body: multipart/form-data with 'file' field

但实际测试结果：
1. https://yunwu.ai/api/upload - 返回404错误
2. https://yunwu.ai/upload - 返回200但是HTML页面
3. https://api.yunwu.ai/upload - 返回200但是HTML页面

结论：文档中的API端点可能已过期或不可用。
建议联系API提供商确认正确的端点。
"""

import requests
import os

def create_minimal_test_image(filename="test.png"):
    """创建最小的测试PNG图片"""
    png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    with open(filename, 'wb') as f:
        f.write(png_data)
    return filename

def test_upload(image_path="test.png"):
    """测试图片上传"""
    if not os.path.exists(image_path):
      print(f"创建测试图片: {image_path}")
      image_path = create_minimal_test_image(image_path)

    url = "https://yunwu.ai/api/upload"
    token = (os.getenv("YUNWU_API_KEY") or os.getenv("YUNWU_ALL_KEY") or "").strip()
    if not token:
        raise RuntimeError("Missing token: set YUNWU_API_KEY or YUNWU_ALL_KEY")
    headers = {
        "Authorization": f"Bearer {token}"
    }

    print(f"测试图床上传API")
    print(f"URL: {url}")
    print(f"图片: {image_path}\n")

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
                print("✗ 返回200但不是JSON格式")
        else:
            print(f"✗ 上传失败: {response.status_code}")

    except Exception as e:
        print(f"✗ 请求错误: {e}")

    return None

if __name__ == "__main__":
    print(__doc__)
    print("\n" + "="*60 + "\n")
    test_upload()
