# Midjourney Parameter System Documentation

A comprehensive Python module for managing Midjourney parameters and commands.

## Overview

This module provides a structured data system for all Midjourney parameters, making it easy to:
- Look up parameter definitions and usage
- Validate parameter values
- Build parameter strings programmatically
- Search and filter parameters by category
- Ensure compatibility with different Midjourney versions

## Installation

No external dependencies required. Simply import the module:

```python
from mj_parameters import MJParameterSystem
```

## Quick Start

```python
from mj_parameters import MJParameterSystem

# Initialize the system
mj = MJParameterSystem()

# Build a parameter string
params = mj.build_parameter_string(
    aspect="16:9",
    quality=2,
    stylize=750,
    chaos=30
)
# Output: "--ar 16:9 --q 2 --s 750 --c 30"

# Create a complete prompt
prompt = f"A beautiful landscape {params}"
```

## Parameter Categories

The system organizes parameters into 6 categories:

### 1. Core Parameters
Essential parameters for basic image generation:
- **aspect** (`--ar`): Aspect ratio (e.g., 16:9, 9:16, 4:3)
- **quality** (`--q`): Rendering quality (0.25, 0.5, 1, 2)
- **seed** (`--seed`): Reproducible generation (0-4294967295)
- **no** (`--no`): Exclude elements from image
- **version** (`--v`): Algorithm version (1-7)
- **image_weight** (`--iw`): Image vs text prompt influence (0-3)
- **tile** (`--tile`): Create seamless patterns

### 2. Style Parameters
Control artistic interpretation:
- **stylize** (`--s`): Aesthetic style strength (0-1000)
- **chaos** (`--c`): Result variability (0-100)
- **style** (`--style`): Alternative aesthetics (e.g., "raw")

### 3. Processing Parameters
Control generation speed and resource usage:
- **fast** (`--fast`): Default GPU mode
- **relax** (`--relax`): Queue-based, no GPU usage
- **turbo** (`--turbo`): 4x faster, 2x GPU cost

### 4. Reference Parameters
Use reference images for consistency:
- **style_reference** (`--sref`): Style reference URL or "random"
- **style_reference_version** (`--sv`): Style algorithm version
- **style_weight** (`--sw`): Style influence strength (0-1000)
- **character_reference** (`--cref`): Character reference URL
- **character_weight** (`--cw`): Character influence (0-100)

### 5. Video Parameters
For video generation (V6+):
- **motion** (`--motion`): Motion amount ("low" or "high")
- **raw** (`--raw`): Precise motion control

### 6. Special Features
Advanced and specialized parameters:
- **niji** (`--niji`): Anime/manga style (4, 5, or 6)
- **private** (`--p`): Private generation
- **repeat** (`--r`): Multiple generations (1-40)
- **stop** (`--stop`): Early stop (10-100)
- **video** (`--video`): Save progress video (V1-V5)
- **weird** (`--w`): Quirky, unconventional results (0-3000)

## API Reference

### MJParameterSystem Class

#### Methods

##### `get_parameter(name: str) -> Optional[ParameterDefinition]`
Get parameter definition by name or alias.

```python
param = mj.get_parameter("quality")
# or
param = mj.get_parameter("--q")
```

##### `get_parameters_by_category(category: ParameterCategory) -> List[ParameterDefinition]`
Get all parameters in a specific category.

```python
from mj_parameters import ParameterCategory

style_params = mj.get_parameters_by_category(ParameterCategory.STYLE)
```

##### `validate_parameter_value(param_name: str, value: Union[str, int, float]) -> bool`
Validate if a value is acceptable for a parameter.

```python
is_valid = mj.validate_parameter_value("quality", 2)  # True
is_valid = mj.validate_parameter_value("quality", 5)  # False
```

##### `build_parameter_string(**kwargs) -> str`
Build a parameter string from keyword arguments.

```python
params = mj.build_parameter_string(
    aspect="16:9",
    quality=2,
    stylize=750,
    chaos=30,
    seed=123456
)
# Returns: "--ar 16:9 --q 2 --s 750 --c 30 --seed 123456"
```

##### `search_parameters(keyword: str) -> List[ParameterDefinition]`
Search parameters by keyword in name or description.

```python
results = mj.search_parameters("style")
```

##### `get_all_categories() -> List[str]`
Get list of all parameter categories.

```python
categories = mj.get_all_categories()
```

## Usage Examples

### Example 1: Basic Parameter Lookup

```python
from mj_parameters import MJParameterSystem

mj = MJParameterSystem()
param = mj.get_parameter("stylize")

print(f"Name: {param.name}")
print(f"Aliases: {param.aliases}")
print(f"Range: {param.min_value}-{param.max_value}")
print(f"Default: {param.default_value}")
print(f"Description: {param.description}")
```

### Example 2: Building Prompts

```python
# Create a landscape prompt
prompt = "A serene mountain lake at golden hour"
params = mj.build_parameter_string(
    aspect="16:9",
    quality=2,
    stylize=500,
    version=7
)
full_prompt = f"{prompt} {params}"
```

### Example 3: Anime Style Generation

```python
prompt = "A magical girl transformation scene"
params = mj.build_parameter_string(
    niji=6,
    aspect="9:16",
    stylize=300
)
full_prompt = f"{prompt} {params}"
```

### Example 4: Character Consistency

```python
prompt = "Portrait of the character in a forest"
params = mj.build_parameter_string(
    character_reference="https://example.com/character.jpg",
    character_weight=100,
    aspect="2:3",
    quality=2
)
full_prompt = f"{prompt} {params}"
```

### Example 5: Style Reference

```python
prompt = "A futuristic cityscape"
params = mj.build_parameter_string(
    style_reference="https://example.com/style.jpg",
    style_weight=200,
    aspect="16:9",
    stylize=400
)
full_prompt = f"{prompt} {params}"
```

### Example 6: Validation Before Use

```python
# Validate parameters before building
values = {
    "quality": 2,
    "chaos": 50,
    "stylize": 750
}

all_valid = all(
    mj.validate_parameter_value(key, value)
    for key, value in values.items()
)

if all_valid:
    params = mj.build_parameter_string(**values)
else:
    print("Invalid parameter values detected")
```

## Parameter Details

### Aspect Ratio (--ar)
- **Common ratios**: 16:9 (widescreen), 9:16 (portrait), 1:1 (square), 4:3, 3:2
- **Version support**: All versions, but ranges vary
- **Example**: `--ar 16:9`

### Quality (--q)
- **Values**: 0.25 (draft), 0.5 (medium), 1 (default), 2 (high detail)
- **Trade-off**: Higher quality = longer generation time
- **Example**: `--q 2`

### Stylize (--s)
- **Range**: 0-1000
- **Low (0-250)**: More literal interpretation
- **Medium (250-750)**: Balanced
- **High (750-1000)**: More artistic interpretation
- **Example**: `--s 500`

### Chaos (--c)
- **Range**: 0-100
- **Low (0-25)**: Consistent results
- **Medium (25-75)**: Moderate variation
- **High (75-100)**: Highly varied results
- **Example**: `--c 50`

### Seed (--seed)
- **Range**: 0-4294967295
- **Use case**: Reproducible results
- **Note**: Same seed + same prompt = same image
- **Example**: `--seed 123456`

### No Parameter (--no)
- **Use case**: Exclude unwanted elements
- **More effective than**: Using "without" in prompt
- **Example**: `--no people, cars, buildings`

### Version (--v)
- **Available**: 1, 2, 3, 4, 5, 6, 7
- **Latest**: v7 (as of 2025)
- **Example**: `--v 7`

### Image Weight (--iw)
- **Range**: 0-3
- **Default**: 1
- **Low (0-1)**: Text prompt dominates
- **High (1-3)**: Image reference dominates
- **Example**: `--iw 1.5`

### Style Reference (--sref)
- **Input**: Image URL or "random"
- **Use case**: Apply style from reference image
- **Combine with**: --sw to control strength
- **Example**: `--sref https://example.com/style.jpg --sw 200`

### Character Reference (--cref)
- **Input**: Image URL
- **Use case**: Maintain character consistency
- **Combine with**: --cw to control influence
- **Example**: `--cref https://example.com/character.jpg --cw 100`

### Weird (--w)
- **Range**: 0-3000
- **Effect**: Adds unconventional, quirky qualities
- **Use case**: Experimental, unique results
- **Example**: `--w 1000`

### Niji (--niji)
- **Values**: 4, 5, 6
- **Use case**: Anime/manga style generation
- **Note**: Uses specialized Niji model
- **Example**: `--niji 6`

## Version Compatibility

| Parameter | V1-V3 | V4 | V5 | V6 | V7 |
|-----------|-------|----|----|----|----|
| --ar | ✓ | ✓ | ✓ | ✓ | ✓ |
| --q | ✓ | ✓ | ✓ | ✓ | ✓ |
| --s | ✓ | ✓ | ✓ | ✓ | ✓ |
| --c | ✓ | ✓ | ✓ | ✓ | ✓ |
| --seed | ✓ | ✓ | ✓ | ✓ | ✓ |
| --no | ✓ | ✓ | ✓ | ✓ | ✓ |
| --iw | ✓ | ✓ | ✓ | ✓ | ✓ |
| --tile | ✓ | ✓ | ✓ | ✓ | ✓ |
| --style | - | - | ✓ | ✓ | ✓ |
| --turbo | - | - | ✓ | ✓ | ✓ |
| --sref | - | - | ✓ | ✓ | ✓ |
| --cref | - | - | - | ✓ | ✓ |
| --motion | - | - | - | ✓ | ✓ |
| --weird | - | - | - | ✓ | ✓ |

## Best Practices

1. **Start Simple**: Begin with basic parameters (--ar, --q, --v) before adding advanced ones
2. **Don't Overload**: Using too many parameters can produce unpredictable results
3. **Test Incrementally**: Change one parameter at a time to understand its effect
4. **Use Seed for Consistency**: When you find a good result, note the seed for variations
5. **Validate Values**: Always validate parameter values before submission
6. **Version Awareness**: Check version compatibility before using advanced parameters

## Integration Example

```python
from mj_parameters import MJParameterSystem

class MidjourneyClient:
    def __init__(self):
        self.param_system = MJParameterSystem()

    def create_prompt(self, description: str, **params):
        """Create a complete Midjourney prompt with parameters"""
        # Validate all parameters
        for key, value in params.items():
            if not self.param_system.validate_parameter_value(key, value):
                raise ValueError(f"Invalid value {value} for parameter {key}")

        # Build parameter string
        param_string = self.param_system.build_parameter_string(**params)

        # Combine with description
        return f"{description} {param_string}"

    def get_parameter_info(self, param_name: str):
        """Get detailed information about a parameter"""
        param = self.param_system.get_parameter(param_name)
        if not param:
            return None

        return {
            "name": param.name,
            "aliases": param.aliases,
            "description": param.description,
            "examples": param.examples,
            "range": f"{param.min_value}-{param.max_value}" if param.min_value else "N/A",
            "default": param.default_value,
            "version": param.version_compatibility
        }

# Usage
client = MidjourneyClient()
prompt = client.create_prompt(
    "A mystical forest at twilight",
    aspect="16:9",
    quality=2,
    stylize=600,
    version=7
)
print(prompt)
```

## Sources

This parameter system was compiled from the following sources:
- [Midjourney Complete Parameter List](https://learningprompt.wiki/docs/midjourney/mj-tutorial-list/midjourney-parameters-list)
- [All MidJourney Parameters Overview](https://www.archiobjects.org/all-midjourney-parameters-a-simple-and-complete-overview/)
- [Midjourney Cheat Sheet](https://sref-midjourney.com/cheatsheet)
- [2025 Midjourney Prompts Cheat Sheet](https://www.aiarty.com/midjourney-prompts/midjourney-prompts-cheat-sheet.htm)
- [Midjourney Parameter Cheat Sheet V7](https://runtheprompts.com/resources/midjourney-info/midjourney-parameter-cheat-sheet-v7/)

## License

This module is provided as-is for educational and development purposes.
