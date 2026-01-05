# Kling Video Generation API

Python client for the Kling AI video generation API (image-to-video).

## ⚠️ Important Notice

**This API has costs associated with each request.** Always validate your requests and understand the pricing before making actual API calls.

## 📦 Installation

No external dependencies required. The module uses only Python standard library.

```python
from kling import KlingClient, create_simple_video_request
```

## 🚀 Quick Start

### Basic Usage

```python
from kling import KlingClient, create_simple_video_request

# Initialize client
client = KlingClient(api_token="your-api-token")

# Create request
request = create_simple_video_request(
    model_name="kling-v2-6",
    image_url="https://example.com/image.jpg",
    prompt="A beautiful sunset with gentle movement",
    duration="5"
)

# Validate before sending (recommended!)
is_valid, error = client.validate_request(request)
if is_valid:
    response = client.generate_video(request)
    print(response)
```

## 📚 Features

### 1. Simple Video Generation
Convert an image to video with basic parameters:

```python
request = create_simple_video_request(
    model_name="kling-v2-6",
    image_url="https://example.com/image.jpg",
    prompt="Gentle wind blowing",
    duration="5",
    mode="std"  # or "pro"
)
```

### 2. Camera Control
Add camera movement to your videos:

```python
from kling import create_video_with_camera_control

request = create_video_with_camera_control(
    model_name="kling-v2-6",
    image_url="https://example.com/image.jpg",
    horizontal=1.0,   # Move right
    vertical=0.0,     # No vertical movement
    zoom=0.5,         # Zoom in
    duration="5"
)
```

### 3. Dynamic Masks
Animate specific parts of the image:

```python
from kling import create_video_with_dynamic_mask

trajectories = [
    (0.0, 0.0),  # Start
    (0.5, 0.5),  # Middle
    (1.0, 1.0)   # End
]

request = create_video_with_dynamic_mask(
    model_name="kling-v2-6",
    image_url="https://example.com/image.jpg",
    mask_url="https://example.com/mask.jpg",
    trajectories=trajectories,
    duration="5"
)
```

### 4. Advanced Configuration

```python
from kling import KlingVideoRequest, CameraControl

request = KlingVideoRequest(
    model_name="kling-v2-6",
    image="https://example.com/image.jpg",
    prompt="Cinematic camera movement",
    negative_prompt="blurry, low quality",
    cfg_scale=0.7,
    mode="pro",
    duration="10",
    camera_control=CameraControl(
        type="simple",
        config={
            "horizontal": 1.0,
            "vertical": 0.0,
            "zoom": 0.5
        }
    )
)
```

## 📖 API Reference

### KlingClient

Main client for API interactions.

```python
client = KlingClient(
    api_token="your-token",
    host="yunwu.ai"  # default
)
```

#### Methods

- `generate_video(request)` - Generate video from request
- `validate_request(request)` - Validate request parameters

### KlingVideoRequest

Main request object with all parameters.

#### Required Parameters
- `model_name` (str): Model to use (e.g., "kling-v2-6")
- `image` (str): URL to source image

#### Optional Parameters
- `prompt` (str): Text prompt for generation
- `negative_prompt` (str): Elements to avoid
- `cfg_scale` (float): Configuration scale (0.0-1.0, default: 0.5)
- `mode` (str): "std" or "pro" (default: "std")
- `duration` (str): Video duration in seconds (default: "5")
- `camera_control` (CameraControl): Camera movement settings
- `dynamic_masks` (List[DynamicMask]): Animated masks
- `callback_url` (str): Webhook URL for completion
- `external_task_id` (str): Your task identifier

### Helper Functions

#### create_simple_video_request()
Create basic video generation request.

```python
request = create_simple_video_request(
    model_name="kling-v2-6",
    image_url="https://example.com/image.jpg",
    prompt="",
    duration="5",
    mode="std"
)
```

#### create_video_with_camera_control()
Create request with camera movement.

```python
request = create_video_with_camera_control(
    model_name="kling-v2-6",
    image_url="https://example.com/image.jpg",
    horizontal=1.0,
    vertical=0.0,
    zoom=0.5,
    duration="5"
)
```

#### create_video_with_dynamic_mask()
Create request with animated mask.

```python
request = create_video_with_dynamic_mask(
    model_name="kling-v2-6",
    image_url="https://example.com/image.jpg",
    mask_url="https://example.com/mask.jpg",
    trajectories=[(0, 0), (1, 1)],
    duration="5"
)
```

## 🔍 Validation

Always validate requests before sending:

```python
is_valid, error = client.validate_request(request)
if not is_valid:
    print(f"Invalid request: {error}")
else:
    # Safe to send
    response = client.generate_video(request)
```

### Validation Checks
- Required fields present
- cfg_scale in range (0.0-1.0)
- mode is "std" or "pro"
- duration is positive number
- Image URL provided

## 💡 Best Practices

1. **Always Validate First**
   ```python
   is_valid, error = client.validate_request(request)
   if not is_valid:
       print(f"Error: {error}")
       return
   ```

2. **Preview Request Payload**
   ```python
   print(request.to_json())  # See what will be sent
   ```

3. **Handle Errors Gracefully**
   ```python
   try:
       response = client.generate_video(request)
   except Exception as e:
       print(f"API error: {e}")
   ```

4. **Use Callbacks for Long Operations**
   ```python
   request = KlingVideoRequest(
       model_name="kling-v2-6",
       image="https://example.com/image.jpg",
       callback_url="https://your-server.com/webhook",
       external_task_id="task-123"
   )
   ```

## 📝 Examples

See `kling_examples.py` for comprehensive examples:

```bash
python3 -m kling.kling_examples
```

Examples include:
1. Simple video generation
2. Camera control
3. Advanced configuration
4. Dynamic masks
5. Batch processing
6. Error handling
7. Request inspection

## 🎯 Parameter Guide

### cfg_scale (Configuration Scale)
- Range: 0.0 - 1.0
- Lower values: More faithful to prompt
- Higher values: More creative interpretation
- Default: 0.5

### mode (Generation Mode)
- `"std"`: Standard quality, faster, lower cost
- `"pro"`: Professional quality, slower, higher cost

### duration
- String value in seconds
- Common values: "5", "10", "15"
- Longer duration = higher cost

### Camera Control
- `horizontal`: -1.0 (left) to 1.0 (right)
- `vertical`: -1.0 (down) to 1.0 (up)
- `zoom`: -1.0 (out) to 1.0 (in)
- `pan`, `tilt`, `roll`: Advanced controls

## ⚙️ Configuration

### Environment Variables
Store your API token securely:

```bash
# .env.local
KLING_API_TOKEN=your-token-here
```

```python
import os
from kling import KlingClient

token = os.getenv("KLING_API_TOKEN")
client = KlingClient(api_token=token)
```

## 🔒 Security

- Never commit API tokens to version control
- Use environment variables for sensitive data
- Validate all user inputs before creating requests
- Implement rate limiting for production use

## 💰 Cost Management

- Validate requests before sending
- Use "std" mode for testing
- Start with shorter durations
- Implement request logging
- Set up usage alerts

## 🐛 Troubleshooting

### Common Issues

**Invalid cfg_scale**
```python
# Wrong
cfg_scale=1.5  # Out of range

# Correct
cfg_scale=0.7  # Within 0.0-1.0
```

**Missing required fields**
```python
# Wrong
request = KlingVideoRequest(model_name="kling-v2-6")  # Missing image

# Correct
request = KlingVideoRequest(
    model_name="kling-v2-6",
    image="https://example.com/image.jpg"
)
```

**Invalid mode**
```python
# Wrong
mode="standard"  # Invalid

# Correct
mode="std"  # or "pro"
```

## 📊 Response Format

```python
{
    "status_code": 200,
    "data": {
        "task_id": "...",
        "status": "processing",
        # ... other fields
    }
}
```

## 🔄 Async Support

For async operations, use callbacks:

```python
request = KlingVideoRequest(
    model_name="kling-v2-6",
    image="https://example.com/image.jpg",
    callback_url="https://your-server.com/webhook",
    external_task_id="unique-id-123"
)
```

## 📄 License

This module is provided as-is for integration with the Kling API.

## 🤝 Contributing

When adding features:
1. Update parameter validation
2. Add examples
3. Update documentation
4. Test without making actual API calls

## ⚠️ Disclaimer

This is an API client wrapper. Costs are determined by the Kling API service. Always verify pricing and test with small requests first.
