# Demo Project Structure

## 📁 Directory Organization

```
demo/
├── mj/                      # Midjourney Parameter System Module
│   ├── __init__.py         # Package initialization
│   ├── mj_parameters.py    # Core parameter system (22KB)
│   ├── mj_example.py       # Usage examples
│   ├── test_mj_parameters.py # Unit tests
│   └── mj.py               # Legacy MJ code
│
├── kling/                   # Kling Video Generation API Module ⭐
│   ├── __init__.py         # Package initialization
│   ├── kling_client.py     # Core client (13KB)
│   ├── kling_examples.py   # Usage examples
│   ├── query_examples.py   # Query examples
│   ├── test_kling_payload.py # Tests
│   └── *.md                # Documentation
│
├── jimeng/                  # Jimeng Video Generation API Module ⭐
│   ├── __init__.py         # Package initialization
│   ├── jimeng_client.py    # Core client (5.9KB)
│   ├── jimeng_examples.py  # Usage examples
│   └── *.md                # Documentation
│
├── runway/                  # Runway Video Generation API Module ⭐
│   ├── __init__.py         # Package initialization
│   ├── runway_client.py    # Core client
│   ├── runway_examples.py  # Usage examples
│   ├── query_examples.py   # Query examples
│   └── *.md                # Documentation
│
├── sora/                    # Sora Video Generation API Module ⭐
│   ├── __init__.py         # Package initialization
│   ├── sora_client.py      # Core client
│   ├── sora_examples.py    # Usage examples
│   ├── query_examples.py   # Query examples
│   └── *.md                # Documentation
│
├── tests/                   # Test Files
│   ├── upload.py
│   ├── upload_test.py
│   ├── upload_test_summary.py
│   ├── test_upload.py
│   ├── final_upload_test.py
│   ├── test_image_upload.py
│   ├── test_image_bed.py
│   ├── find_endpoint.py
│   └── test_endpoints.py
│
├── images/                  # Test Images
│   ├── 1.png
│   ├── 2.png
│   ├── test.png
│   ├── test_image.png
│   └── 1764856682673.png
│
├── docs/                    # Documentation
│   ├── MJ_PARAMETERS_README.md  # MJ system documentation (12KB)
│   ├── SOURCES.md               # Reference sources (6.2KB)
│   ├── 项目总结.md               # Chinese summary
│   ├── README.md                # General readme
│   └── README_TEST.md           # Test documentation
│
├── main.py                  # Main entry point
├── pyproject.toml          # Project configuration
├── uv.lock                 # Dependency lock file
├── .env.local              # Environment variables
├── .gitignore              # Git ignore rules
└── .python-version         # Python version specification
```

## 🎯 Quick Start

### Using the MJ Parameter System

```python
# Import from the mj package
from mj import MJParameterSystem, ParameterCategory

# Initialize
mj = MJParameterSystem()

# Build parameters
params = mj.build_parameter_string(
    aspect="16:9",
    quality=2,
    stylize=750
)
```

### Using Kling Video API

```python
# Import from kling package
from kling import KlingClient, create_simple_video_request

# Initialize
client = KlingClient(api_token="your-token")

# Create request
request = create_simple_video_request(
    model_name="kling-v2-6",
    image_url="https://example.com/image.jpg",
    prompt="Beautiful sunset",
    duration="5"
)

# Generate video
response = client.generate_video(request)
```

### Using Jimeng Video API

```python
# Import from jimeng package
from jimeng import JimengClient, create_simple_video_request, wait_for_video_completion

# Initialize
client = JimengClient(api_token="your-token")

# Create request
request = create_simple_video_request(
    model="jimeng-video-3.0",
    prompt="cat fish",
    aspect_ratio="16:9",
    size="1080P"
)

# Generate video
response = client.generate_video(request)
video_id = response["data"]["id"]

# Query status
status_response = client.query_video(video_id)

# Or wait for completion
result = wait_for_video_completion(client, video_id, timeout=600)
```

### Using Runway Video API

```python
# Import from runway package
from runway import RunwayClient, create_video_5s

# Initialize
client = RunwayClient(api_token="your-token")

# Create 5-second video request
request = create_video_5s(
    image_url="https://example.com/image.jpg",
    prompt_text="cat dance"
)

# Generate video
response = client.generate_video(request)
```

### Using Sora Video API

```python
# Import from sora package
from sora import SoraClient, create_simple_video_request, wait_for_video_completion

# Initialize
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
status_response = client.query_video(video_id)

# Or wait for completion
result = wait_for_video_completion(client, video_id, timeout=600)
```

### Running Tests

```bash
# Run MJ parameter tests
python3 -m mj.test_mj_parameters

# Run Jimeng unit tests
python3 -m jimeng.test_jimeng

# Run MJ examples
python3 -m mj.mj_example

# Run Kling examples
python3 -m kling.kling_examples

# Run Kling query examples
python3 -m kling.query_examples

# Run Jimeng examples
python3 -m jimeng.jimeng_examples

# Run Jimeng query examples
python3 -m jimeng.query_examples

# Run Runway examples
python3 -m runway.runway_examples

# Run Runway query examples
python3 -m runway.query_examples

# Run Sora examples
python3 -m sora.sora_examples

# Run Sora query examples
python3 -m sora.query_examples
```

## 📚 Documentation

### Midjourney Parameter System
- **Main Doc**: `docs/MJ_PARAMETERS_README.md`
- **Sources**: `docs/SOURCES.md`
- **Summary**: `docs/项目总结.md`

### Kling Video API
- **Main Doc**: `kling/README.md`
- **Chinese Guide**: `kling/使用说明.md`
- **Query Guide**: `kling/查询功能说明.md`
- **Model Info**: `kling/模型更新说明.md`

### Jimeng Video API
- **Main Doc**: `jimeng/README.md`
- **Chinese Guide**: `jimeng/使用说明.md`
- **Query Guide**: `jimeng/查询功能说明.md`
- **Module Info**: `jimeng/模块说明.md`

### Runway Video API
- **Main Doc**: `runway/README.md`
- **Chinese Guide**: `runway/使用说明.md`

### Sora Video API
- **Main Doc**: `sora/README.md`
- **Chinese Guide**: `sora/使用说明.md`

## 🔧 Development

- Main application: `main.py`
- Audio processing pipeline: `audio_processing.py`
- Configuration: `pyproject.toml`
- Environment: `.env.local`

### 🔊 Audio Processing Demo

```bash
python3 demo/main.py audio input.wav output_pro.wav
```

`demo/audio_processing.py` uses a two-pass `loudnorm` run (analysis to `null`, then apply with `measured_*`) for more stable loudness results.

Optional enhancement: `python3 demo/main.py audio input.wav output_pro.wav --exciter`
