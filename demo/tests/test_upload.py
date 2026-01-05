import http.client
import json
import mimetypes
import os
from codecs import encode

def upload_image(image_path):
    """上传图片到图床API"""
    conn = http.client.HTTPSConnection("yunwu.ai")

    # 读取图片文件
    with open(image_path, 'rb') as f:
        image_data = f.read()

    # 构建multipart/form-data请求
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'

    dataList = []
    dataList.append(encode(f'--{boundary}'))
    dataList.append(encode('Content-Disposition: form-data; name="file"; filename="test.png"'))
    dataList.append(encode('Content-Type: image/png'))
    dataList.append(encode(''))
    dataList.append(image_data)
    dataList.append(encode(f'--{boundary}--'))
    dataList.append(encode(''))

    body = b'\r\n'.join(dataList)

    token = (os.getenv("YUNWU_API_KEY") or os.getenv("YUNWU_ALL_KEY") or "").strip()
    if not token:
        raise RuntimeError("Missing token: set YUNWU_API_KEY or YUNWU_ALL_KEY")

    headers = {
        'Content-Type': f'multipart/form-data; boundary={boundary}',
        'Authorization': f'Bearer {token}'
    }

    try:
        conn.request("POST", "/api/upload", body, headers)
        res = conn.getresponse()
        data = res.read()

        print(f"状态码: {res.status}")
        print(f"响应: {data.decode('utf-8')}")

        if res.status == 200:
            result = json.loads(data.decode('utf-8'))
            return result
        else:
            print(f"上传失败: {res.status}")
            return None

    except Exception as e:
        print(f"请求出错: {e}")
        return None
    finally:
        conn.close()

if __name__ == "__main__":
    # 使用现有的测试图片
    result = upload_image("1.png")
    if result:
        print(f"\n上传成功!")
        print(json.dumps(result, indent=2, ensure_ascii=False))
