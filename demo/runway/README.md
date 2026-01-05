# Runway Gen4 Video Generation API

Python client for Runway Gen4 image-to-video generation API.

## 📦 Installation

```bash
pip install requests
```

## 🚀 Quick Start

```python
from runway import RunwayClient, create_video_5s

# Initialize client
client = RunwayClient(api_token="your-token")

# Create 5-second video request
request = create_video_5s(
    image_url="https://example.com/image.jpg",
    prompt_text="cat dance"
)

# Generate video
response = client.generate_video(request)
print(response["data"])
```

## 🎯 API Endpoint

- **Generate Video**: `POST https://yunwu.ai/runwayml/v1/image_to_video`
- **Query Status**: `GET https://yunwu.ai/runwayml/v1/tasks/{task_id}`

## 🎬 Supported Models

| Model | Duration | Description |
|-------|----------|-------------|
| `runwayml-gen4_turbo-5` | 5 seconds | Fast generation, 5s videos |
| `runwayml-gen4_turbo-10` | 10 seconds | Fast generation, 10s videos |

## 📝 Parameters

### Required Parameters

- **promptImage** (str): URL to source image
- **model** (str): Model to use (`runwayml-gen4_turbo-5` or `runwayml-gen4_turbo-10`)

### Optional Parameters

- **promptText** (str): Text prompt for video generation (default: `""`)
- **watermark** (bool): Whether to add watermark (default: `False`)
- **duration** (int): Video duration in seconds - must match model (5 or 10)
- **ratio** (str): Video aspect ratio (default: `"1280:768"`)

## 💡 Usage Examples

### Example 1: 5-Second Video

```python
from runway import RunwayClient, create_video_5s

client = RunwayClient(api_token="your-token")

request = create_video_5s(
    image_url="https://example.com/image.jpg",
    prompt_text="cat playing with yarn"
)

response = client.generate_video(request)
```

### Example 2: 10-Second Video

```python
from runway import create_video_10s

request = create_video_10s(
    image_url="https://example.com/image.jpg",
    prompt_text="waves crashing on beach"
)

response = client.generate_video(request)
```

### Example 3: Custom Aspect Ratio

```python
from runway import create_video_5s

request = create_video_5s(
    image_url="https://example.com/image.jpg",
    prompt_text="sunset timelapse",
    ratio="1920:1080"  # Full HD
)
```

### Example 4: With Watermark

```python
from runway import RunwayVideoRequest

request = RunwayVideoRequest(
    promptImage="https://example.com/image.jpg",
    model="runwayml-gen4_turbo-5",
    promptText="cat dance",
    watermark=True,
    duration=5
)
```

### Example 5: Validation

```python
from runway import RunwayClient, create_video_5s

client = RunwayClient(api_token="your-token")
request = create_video_5s(image_url="https://example.com/image.jpg")

# Validate before sending
is_valid, error = client.validate_request(request)
if not is_valid:
    print(f"Invalid request: {error}")
else:
    response = client.generate_video(request)
```

## 🔍 Query Video Status

### Query Interface

```python
from runway import RunwayClient

client = RunwayClient(api_token="your-token")

# Query video status
response = client.query_video("2f19d8a7-3b74-4fc4-af42-d0bcadbaec54")
status = response["data"]["status"]  # processing, completed, failed

if status == "completed":
    video_url = response["data"]["video_url"]
    print(f"Video ready: {video_url}")
```

### Wait for Completion

```python
from runway import RunwayClient, wait_for_video_completion

client = RunwayClient(api_token="your-token")

# Poll until completed
result = wait_for_video_completion(
    client,
    task_id,
    timeout=600,      # 10 minutes
    poll_interval=10   # Check every 10 seconds
)

print(f"Video URL: {result['data']['video_url']}")
```

## 🧪 Testing

### Run examples (dry-run mode, no costs)
```bash
python3 -m runway.runway_examples
```

### Run query examples
```bash
python3 -m runway.query_examples
```

## 📊 Request Payload Format

```json
{
  "promptImage": "https://example.com/image.jpg",
  "model": "runwayml-gen4_turbo-5",
  "promptText": "cat dance",
  "watermark": false,
  "duration": 5,
  "ratio": "1280:768"
}
```

## 💰 Cost Control

1. **Start with 5-second videos** - Lower cost for testing
2. **Validate requests** - Use `validate_request()` before sending
3. **Test with dry-run examples** - Run examples without API calls
4. **Use appropriate duration** - Choose 5s or 10s based on needs

## 🔒 Security

### Use Environment Variables
```python
import os
token = os.getenv("RUNWAY_API_TOKEN")
client = RunwayClient(api_token=token)
```

### Validate Input
```python
if not image_url or not image_url.startswith("https://"):
    raise ValueError("Invalid image URL")
```

## 📚 API Reference

### RunwayClient

```python
client = RunwayClient(
    api_token="your-token",
    base_url="https://yunwu.ai"  # Optional
)
```

#### Methods

- `generate_video(request)` - Generate video from image
- `validate_request(request)` - Validate request parameters

### RunwayVideoRequest

```python
request = RunwayVideoRequest(
    promptImage="https://example.com/image.jpg",
    model="runwayml-gen4_turbo-5",
    promptText="cat dance",
    watermark=False,
    duration=5,
    ratio="1280:768"
)
```

#### Methods

- `to_dict()` - Convert to dictionary
- `to_json()` - Convert to JSON string

### Helper Functions

```python
# Simple request
create_simple_video_request(image_url, model, prompt_text, duration)

# 5-second video
create_video_5s(image_url, prompt_text, ratio)

# 10-second video
create_video_10s(image_url, prompt_text, ratio)
```

## ⚠️ Important Notes

1. **Model and Duration Must Match**
   - `runwayml-gen4_turbo-5` requires `duration=5`
   - `runwayml-gen4_turbo-10` requires `duration=10`

2. **Image URL Required**
   - Must provide valid HTTPS URL to source image

3. **API Costs**
   - Each request incurs costs
   - Always validate before sending

## 🐛 Error Handling

```python
try:
    response = client.generate_video(request)
    if response["status_code"] == 200:
        print("Success!")
    else:
        print(f"Error: {response['status_code']}")
except Exception as e:
    print(f"API error: {e}")
```

## 📚 Comparison with Other Modules

| Feature | Runway | Kling | Jimeng |
|---------|--------|-------|--------|
| Input | Image → Video | Image → Video | Text → Video |
| Duration | 5s, 10s | 5s, 10s | Variable |
| Models | 2 (Gen4) | 2 (v1, v2-6) | 1 (v3.0) |
| Camera Control | ✗ | ✓ | ✗ |
| Watermark Option | ✓ | ✗ | ✗ |
| Aspect Ratios | Custom | Multiple | 4 fixed |
| Query Support | ✓ | ✓ | ✓ |

## 🎉 Summary

✅ Simple image-to-video generation<br>
✅ Two duration options (5s, 10s)<br>
✅ Watermark control<br>
✅ Custom aspect ratios<br>
✅ Request validation<br>
✅ Query and polling support<br>
✅ Complete documentation<br>

Ready to generate videos with Runway Gen4!
