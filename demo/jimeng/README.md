# 即梦视频 API 封装

## 📦 模块说明

即梦视频（Jimeng Video）API 的 Python 封装，支持文本生成视频。

## ⚠️ 重要提示

**此 API 每次调用都有费用！** 使用前务必：
1. 验证请求参数
2. 了解计费规则
3. 先用小规模测试

## 🚀 快速开始

### 基础使用

```python
from jimeng import JimengClient, create_simple_video_request

# 初始化客户端
client = JimengClient(api_token="你的token")

# 创建请求
request = create_simple_video_request(
    model="jimeng-video-3.0",
    prompt="cat fish",
    aspect_ratio="16:9",
    size="1080P"
)

# 验证请求
is_valid, error = client.validate_request(request)
if is_valid:
    # 发送请求（会产生费用）
    response = client.generate_video(request)
    print(response)
else:
    print(f"请求无效: {error}")
```

### 带参考图片

```python
from jimeng import create_video_with_images

request = create_video_with_images(
    model="jimeng-video-3.0",
    prompt="animate these images",
    image_urls=[
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg"
    ],
    aspect_ratio="16:9",
    size="1080P"
)
```

## 📖 参数说明

### 必需参数
- `model`: 模型名称（如 "jimeng-video-3.0"）
- `prompt`: 文本提示词

### 可选参数
- `aspect_ratio`: 宽高比
  - `"16:9"`: 宽屏（默认）
  - `"9:16"`: 竖屏
  - `"1:1"`: 正方形
  - `"4:3"`: 标准
- `size`: 分辨率
  - `"720P"`: 标清
  - `"1080P"`: 高清（默认）
- `images`: 参考图片 URL 列表

## 🎯 使用场景

### 场景 1: 简单文生视频
```python
request = create_simple_video_request(
    model="jimeng-video-3.0",
    prompt="cat playing with yarn",
    aspect_ratio="16:9",
    size="1080P"
)
```

### 场景 2: 竖屏视频
```python
request = create_simple_video_request(
    model="jimeng-video-3.0",
    prompt="beautiful waterfall",
    aspect_ratio="9:16",  # 竖屏
    size="1080P"
)
```

### 场景 3: 带参考图片
```python
request = create_video_with_images(
    model="jimeng-video-3.0",
    prompt="smooth animation transition",
    image_urls=[
        "https://example.com/start.jpg",
        "https://example.com/end.jpg"
    ],
    aspect_ratio="16:9",
    size="1080P"
)
```

### 场景 4: 批量生成
```python
prompts = [
    "cat playing",
    "dog running",
    "bird flying"
]

for prompt in prompts:
    request = create_simple_video_request(
        model="jimeng-video-3.0",
        prompt=prompt,
        aspect_ratio="16:9",
        size="1080P"
    )

    # 验证
    is_valid, error = client.validate_request(request)
    if is_valid:
        response = client.generate_video(request)
        print(f"生成成功: {prompt}")
```

## 🔍 参数验证

使用前务必验证：

```python
is_valid, error = client.validate_request(request)
if not is_valid:
    print(f"请求无效: {error}")
    return

# 安全发送
response = client.generate_video(request)
```

### 验证检查项
- ✓ 必需字段存在
- ✓ aspect_ratio 在有效值中
- ✓ size 在有效值中
- ✓ prompt 不为空

## 💡 最佳实践

### 1. 预览请求内容
```python
# 查看将要发送的内容
print(request.to_json())
```

### 2. 使用环境变量存储 Token
```python
import os
from jimeng import JimengClient

token = os.getenv("JIMENG_API_TOKEN")
client = JimengClient(api_token=token)
```

### 3. 错误处理
```python
try:
    response = client.generate_video(request)
    print(f"成功: {response}")
except Exception as e:
    print(f"API 错误: {e}")
```

## 🔍 查询视频状态

### 查询接口

```python
from jimeng import JimengClient

client = JimengClient(api_token="your-token")

# 查询视频状态
response = client.query_video("jimeng:7391ad0e-9813-48ba-a742-ed0720e44e45")
status = response["data"]["status"]  # processing, completed, failed

if status == "completed":
    video_url = response["data"]["video_url"]
    print(f"Video ready: {video_url}")
```

### 等待完成

```python
from jimeng import JimengClient, wait_for_video_completion

client = JimengClient(api_token="your-token")

# 轮询直到完成
result = wait_for_video_completion(
    client,
    video_id,
    timeout=600,      # 10 minutes
    poll_interval=10   # Check every 10 seconds
)

print(f"Video URL: {result['data']['video_url']}")
```

## 🧪 测试

### 运行单元测试
```bash
python3 -m jimeng.test_jimeng
```

### 运行示例（干跑模式，不产生费用）
```bash
python3 -m jimeng.jimeng_examples
```

### 运行查询示例
```bash
python3 -m jimeng.query_examples
```

## 📊 实际 Payload 格式

封装生成的 JSON 格式：

```json
{
  "model": "jimeng-video-3.0",
  "prompt": "cat fish",
  "aspect_ratio": "16:9",
  "size": "1080P",
  "images": []
}
```

## 🎯 API 端点

- **生成视频**: `POST https://yunwu.ai/v1/video/create`
- **查询状态**: `GET https://yunwu.ai/v1/video/query?id={video_id}`

## 💰 成本控制建议

1. **先用 720P 测试**
   ```python
   size="720P"  # 更便宜
   ```

2. **验证后再发送**
   ```python
   is_valid, error = client.validate_request(request)
   if not is_valid:
       return  # 避免无效请求产生费用
   ```

3. **记录所有请求**
   ```python
   import logging
   logging.info(f"Sending request: {request.to_dict()}")
   response = client.generate_video(request)
   logging.info(f"Response: {response}")
   ```

## 🔒 安全建议

1. **不要提交 Token 到版本控制**
   ```bash
   # .env.local
   JIMENG_API_TOKEN=your-token-here
   ```

2. **使用环境变量**
   ```python
   import os
   token = os.getenv("JIMENG_API_TOKEN")
   ```

3. **验证用户输入**
   ```python
   # 验证 prompt 长度
   if len(prompt) > 1000:
       raise ValueError("Prompt too long")
   ```

## 🐛 常见问题

### Q: aspect_ratio 值无效
```python
# 错误
aspect_ratio="21:9"  # 不支持

# 正确
aspect_ratio="16:9"  # 支持的值
```

### Q: size 值无效
```python
# 错误
size="4K"  # 不支持

# 正确
size="1080P"  # 或 "720P"
```

### Q: 缺少必需字段
```python
# 错误
request = JimengVideoRequest(model="jimeng-video-3.0")  # 缺少 prompt

# 正确
request = JimengVideoRequest(
    model="jimeng-video-3.0",
    prompt="cat fish"
)
```

## 📝 完整示例

```python
import os
from jimeng import JimengClient, create_simple_video_request

# 1. 从环境变量获取 token
token = os.getenv("JIMENG_API_TOKEN")
if not token:
    raise ValueError("请设置 JIMENG_API_TOKEN 环境变量")

# 2. 初始化客户端
client = JimengClient(api_token=token)

# 3. 创建请求
request = create_simple_video_request(
    model="jimeng-video-3.0",
    prompt="cat playing with yarn ball",
    aspect_ratio="16:9",
    size="1080P"
)

# 4. 预览请求
print("请求内容:")
print(request.to_json())

# 5. 验证请求
is_valid, error = client.validate_request(request)
if not is_valid:
    print(f"❌ 请求无效: {error}")
    exit(1)

print("✓ 请求验证通过")

# 6. 确认发送（因为会产生费用）
confirm = input("确认发送请求？(yes/no): ")
if confirm.lower() != "yes":
    print("已取消")
    exit(0)

# 7. 发送请求
try:
    response = client.generate_video(request)
    print(f"✓ 成功: {response}")
except Exception as e:
    print(f"❌ 错误: {e}")
```

## 🎉 总结

✅ 完整封装即梦视频 API
✅ 类型安全的数据结构
✅ 参数验证
✅ 辅助函数
✅ 详细文档
✅ 干跑模式示例

现在可以安全、方便地使用即梦视频 API 了！

## 📚 与 Kling 的区别

| 特性 | Kling | Jimeng |
|------|-------|--------|
| 输入 | 图片 → 视频 | 文本 → 视频 |
| 库 | http.client | requests |
| 参考图片 | 必需 | 可选 |
| 相机控制 | ✓ | ✗ |
| 动态遮罩 | ✓ | ✗ |
| 宽高比 | 多种 | 4种 |
| 查询功能 | ✓ | ✓ |
