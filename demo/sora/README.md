# Sora Video Generation API

Python client for OpenAI Sora video generation API.

## 🚀 Quick Start

```python
from sora import SoraClient, create_simple_video_request

# Initialize client
client = SoraClient(api_token="your-token")

# Create request
request = create_simple_video_request(
    model="sora-2",
    prompt="cat dance",
    orientation="portrait",
    duration=15
)

# Generate video
response = client.generate_video(request)
video_id = response["data"]["id"]

# Query status
status = client.query_video(video_id)
```

## 🎬 Supported Models

| Model | Description | Features |
|-------|-------------|----------|
| `sora-2` | Standard Sora model | Text/image-to-video, character reference |
| `sora-2-pro` | Professional model | All features + private mode |

## 📝 Parameters

### Required
- **model** (str): Model to use
- **prompt** (str): Text prompt

### Optional
- **images** (list): Reference image URLs (default: `[]`)
- **orientation** (str): `portrait`, `landscape`, `square` (default: `portrait`)
- **size** (str): `small`, `medium`, `large` (default: `large`)
- **duration** (int): Video duration in seconds (default: `15`)
- **watermark** (bool): Add watermark (default: `False`)
- **private** (bool): Private mode (sora-2-pro only, default: `False`)
- **character_url** (str): Character reference video URL
- **character_timestamps** (str): Timestamps for character (e.g., `"1,3"`)

## 💡 Usage Examples

### Text-to-Video
```python
from sora import create_simple_video_request

request = create_simple_video_request(
    model="sora-2",
    prompt="sunset over ocean",
    orientation="landscape",
    duration=15
)
```

### Image-to-Video
```python
from sora import create_video_with_images

request = create_video_with_images(
    model="sora-2",
    prompt="make animate",
    image_urls=["https://example.com/image.jpg"],
    orientation="portrait"
)
```

### Character Reference
```python
from sora import create_video_with_character

request = create_video_with_character(
    model="sora-2",
    prompt="make animate",
    character_url="https://example.com/character.mp4",
    character_timestamps="1,3"
)
```

### Private Video (Pro)
```python
from sora import create_private_video

request = create_private_video(
    prompt="confidential content",
    orientation="portrait"
)
```

## 🔍 Query Status

```python
from sora import SoraClient, wait_for_video_completion

client = SoraClient(api_token="your-token")

# Query status
response = client.query_video("sora-2:task_01kbfq03gpe0wr9ge11z09xqrj")

# Wait for completion
result = wait_for_video_completion(client, video_id, timeout=600)
print(f"Video URL: {result['data']['video_url']}")
```

## 🧪 Testing

```bash
# Run examples (dry-run mode)
python3 -m sora.sora_examples

# Run query examples
python3 -m sora.query_examples
```

## 📊 API Endpoints

- **Generate**: `POST https://yunwu.ai/v1/video/create`
- **Query**: `GET https://yunwu.ai/v1/video/query?id={video_id}`

## 📚 Comparison

| Feature | Sora | Runway | Kling | Jimeng |
|---------|------|--------|-------|--------|
| Input | Text/Image → Video | Image → Video | Image → Video | Text → Video |
| Models | 2 (sora-2, pro) | 2 (Gen4) | 2 (v1, v2-6) | 1 (v3.0) |
| Character Ref | ✓ | ✗ | ✗ | ✗ |
| Private Mode | ✓ (pro) | ✗ | ✗ | ✗ |
| Watermark | ✓ | ✓ | ✗ | ✗ |
| Query | ✓ | ✓ | ✓ | ✓ |

## 🎉 Summary

✅ Text-to-video and image-to-video<br>
✅ Character reference support<br>
✅ Private mode (pro)<br>
✅ Multiple orientations and sizes<br>
✅ Query and polling support<br>
✅ Complete documentation<br>

Ready to generate videos with Sora!
