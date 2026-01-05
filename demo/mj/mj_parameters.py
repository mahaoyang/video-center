"""
Midjourney Parameters Data System
Comprehensive collection of all Midjourney parameters and commands

Data Collection Date: 2025-12-30
Last Updated: 2025-12-30

REFERENCE SOURCES:
==================
This parameter system was compiled from the following authoritative sources:

1. Midjourney Complete Parameter List
   URL: https://learningprompt.wiki/docs/midjourney/mj-tutorial-list/midjourney-parameters-list
   Coverage: Core parameters (v1-v5), basic usage examples

2. All MidJourney Parameters - Simple and Complete Overview
   URL: https://www.archiobjects.org/all-midjourney-parameters-a-simple-and-complete-overview/
   Coverage: Core parameters with ranges and syntax examples

3. Midjourney Cheat Sheet (SREF)
   URL: https://sref-midjourney.com/cheatsheet
   Coverage: Comprehensive list including v6+ features (sref, cref, motion, weird)
   Note: Most complete source for advanced parameters

4. 2025 Midjourney Prompts Cheat Sheet
   URL: https://www.aiarty.com/midjourney-prompts/midjourney-prompts-cheat-sheet.htm
   Coverage: Latest 2025 parameters and tips
   Note: Could not fetch due to network restrictions

5. Midjourney Parameter Cheat Sheet V7
   URL: https://runtheprompts.com/resources/midjourney-info/midjourney-parameter-cheat-sheet-v7/
   Coverage: V7 specific parameters
   Note: Could not fetch full content

6. Official Midjourney Documentation
   URL: https://docs.midjourney.com/hc/en-us/articles/32859204029709-Parameter-List
   Note: Could not access due to network restrictions, but is the authoritative source

VERSION COVERAGE:
=================
- V1-V3: Basic parameters (ar, q, s, c, seed, no, tile)
- V4: Expanded aspect ratio support
- V5: Added style, turbo, style reference (sref, sw, sv)
- V6: Added character reference (cref, cw), motion, weird
- V7: Latest version (as of 2025-12-30)

MAINTENANCE NOTES:
==================
- To update: Check official Midjourney docs and community resources
- New parameters typically announced on Midjourney Discord and official blog
- Version-specific parameters should be marked in version_compatibility field
- Test new parameters before adding to production systems

USAGE:
======
from mj_parameters import MJParameterSystem

mj = MJParameterSystem()
params = mj.build_parameter_string(aspect="16:9", quality=2, stylize=750)
"""

from dataclasses import dataclass
from typing import Optional, Union, List
from enum import Enum


class ParameterCategory(Enum):
    CORE = "core"
    STYLE = "style"
    PROCESSING = "processing"
    REFERENCE = "reference"
    VIDEO = "video"
    SPECIAL = "special"


class ValueType(Enum):
    INTEGER = "integer"
    FLOAT = "float"
    STRING = "string"
    RATIO = "ratio"
    BOOLEAN = "boolean"
    RANGE = "range"


@dataclass
class ParameterDefinition:
    name: str
    aliases: List[str]
    category: ParameterCategory
    value_type: ValueType
    default_value: Optional[Union[str, int, float]]
    min_value: Optional[Union[int, float]]
    max_value: Optional[Union[int, float]]
    accepted_values: Optional[List[Union[str, int, float]]]
    description: str
    examples: List[str]
    version_compatibility: Optional[str]


# ==============================================================================
# CORE PARAMETERS
# ==============================================================================
# Sources: learningprompt.wiki, archiobjects.org, sref-midjourney.com
# These are the fundamental parameters available across all Midjourney versions

ASPECT_RATIO = ParameterDefinition(
    name="aspect",
    aliases=["--ar", "--aspect"],
    category=ParameterCategory.CORE,
    value_type=ValueType.RATIO,
    default_value="1:1",
    min_value=None,
    max_value=None,
    accepted_values=["16:9", "9:16", "4:3", "3:2", "2:1", "1:1", "5:4"],
    description="Sets the aspect ratio of the generated image",
    examples=["--ar 16:9", "--ar 9:16", "--aspect 4:3"],
    version_compatibility="All versions"
)

QUALITY = ParameterDefinition(
    name="quality",
    aliases=["--q", "--quality"],
    category=ParameterCategory.CORE,
    value_type=ValueType.FLOAT,
    default_value=1,
    min_value=0.25,
    max_value=2,
    accepted_values=[0.25, 0.5, 1, 2],
    description="Controls rendering quality and detail level. Higher values take longer but produce more detailed images",
    examples=["--q 0.25", "--q 2", "--quality 1"],
    version_compatibility="All versions"
)

STYLIZE = ParameterDefinition(
    name="stylize",
    aliases=["--s", "--stylize"],
    category=ParameterCategory.STYLE,
    value_type=ValueType.INTEGER,
    default_value=100,
    min_value=0,
    max_value=1000,
    accepted_values=None,
    description="Controls the strength of Midjourney's default aesthetic style. Lower values stay closer to prompt, higher values add more artistic interpretation",
    examples=["--s 50", "--s 750", "--stylize 500"],
    version_compatibility="All versions"
)

CHAOS = ParameterDefinition(
    name="chaos",
    aliases=["--c", "--chaos"],
    category=ParameterCategory.STYLE,
    value_type=ValueType.INTEGER,
    default_value=0,
    min_value=0,
    max_value=100,
    accepted_values=None,
    description="Controls randomness and variety in results. Higher values produce more unexpected and varied results",
    examples=["--c 10", "--c 75", "--chaos 50"],
    version_compatibility="All versions"
)

SEED = ParameterDefinition(
    name="seed",
    aliases=["--seed", "--sameseed"],
    category=ParameterCategory.CORE,
    value_type=ValueType.INTEGER,
    default_value=None,
    min_value=0,
    max_value=4294967295,
    accepted_values=None,
    description="Provides reproducible results. Same seed + same prompt = same image",
    examples=["--seed 123456", "--seed 999"],
    version_compatibility="All versions"
)

NO_PARAMETER = ParameterDefinition(
    name="no",
    aliases=["--no"],
    category=ParameterCategory.CORE,
    value_type=ValueType.STRING,
    default_value=None,
    min_value=None,
    max_value=None,
    accepted_values=None,
    description="Excludes specific elements from the generated image. More effective than using 'without' in the prompt",
    examples=["--no people", "--no plants", "--no water"],
    version_compatibility="All versions"
)

VERSION = ParameterDefinition(
    name="version",
    aliases=["--v", "--version"],
    category=ParameterCategory.CORE,
    value_type=ValueType.INTEGER,
    default_value=7,
    min_value=1,
    max_value=7,
    accepted_values=[1, 2, 3, 4, 5, 6, 7],
    description="Selects which algorithm version to use for generation",
    examples=["--v 7", "--v 6", "--version 5"],
    version_compatibility="All versions"
)

IMAGE_WEIGHT = ParameterDefinition(
    name="image_weight",
    aliases=["--iw"],
    category=ParameterCategory.REFERENCE,
    value_type=ValueType.FLOAT,
    default_value=1,
    min_value=0,
    max_value=3,
    accepted_values=None,
    description="Controls the influence of reference images vs text prompt. Higher values give more weight to the image",
    examples=["--iw 0.5", "--iw 1.5", "--iw 2"],
    version_compatibility="V3+"
)

TILE = ParameterDefinition(
    name="tile",
    aliases=["--tile"],
    category=ParameterCategory.SPECIAL,
    value_type=ValueType.BOOLEAN,
    default_value=False,
    min_value=None,
    max_value=None,
    accepted_values=None,
    description="Creates seamless repeating patterns suitable for tiling",
    examples=["--tile"],
    version_compatibility="All versions"
)

# ==============================================================================
# STYLE CONTROL PARAMETERS
# ==============================================================================
# Sources: archiobjects.org, sref-midjourney.com
# Control artistic interpretation and aesthetic style

STYLE = ParameterDefinition(
    name="style",
    aliases=["--style"],
    category=ParameterCategory.STYLE,
    value_type=ValueType.STRING,
    default_value=None,
    min_value=None,
    max_value=None,
    accepted_values=["raw"],
    description="Alternative aesthetics with less auto-beautification. 'raw' provides more literal interpretation",
    examples=["--style raw"],
    version_compatibility="V5+"
)

# ==============================================================================
# PROCESSING MODE PARAMETERS
# ==============================================================================
# Source: sref-midjourney.com
# Control generation speed and GPU resource allocation

FAST = ParameterDefinition(
    name="fast",
    aliases=["--fast"],
    category=ParameterCategory.PROCESSING,
    value_type=ValueType.BOOLEAN,
    default_value=True,
    min_value=None,
    max_value=None,
    accepted_values=None,
    description="Default GPU allocation mode for faster processing",
    examples=["--fast"],
    version_compatibility="All versions"
)

RELAX = ParameterDefinition(
    name="relax",
    aliases=["--relax"],
    category=ParameterCategory.PROCESSING,
    value_type=ValueType.BOOLEAN,
    default_value=False,
    min_value=None,
    max_value=None,
    accepted_values=None,
    description="Queue-based processing with no GPU usage. Wait time 0-10 minutes",
    examples=["--relax"],
    version_compatibility="All versions"
)

TURBO = ParameterDefinition(
    name="turbo",
    aliases=["--turbo"],
    category=ParameterCategory.PROCESSING,
    value_type=ValueType.BOOLEAN,
    default_value=False,
    min_value=None,
    max_value=None,
    accepted_values=None,
    description="4x faster processing, uses 2x GPU minutes",
    examples=["--turbo"],
    version_compatibility="V5+"
)

# ==============================================================================
# REFERENCE PARAMETERS
# ==============================================================================
# Source: sref-midjourney.com (most comprehensive for v5+ reference features)
# Use reference images for style and character consistency
# Note: sref (style reference) added in V5, cref (character reference) added in V6

STYLE_REFERENCE = ParameterDefinition(
    name="style_reference",
    aliases=["--sref"],
    category=ParameterCategory.REFERENCE,
    value_type=ValueType.STRING,
    default_value=None,
    min_value=None,
    max_value=None,
    accepted_values=None,
    description="Style reference via number or image URL. Use 'random' for random style",
    examples=["--sref https://example.com/image.jpg", "--sref random"],
    version_compatibility="V5+"
)

STYLE_REFERENCE_VERSION = ParameterDefinition(
    name="style_reference_version",
    aliases=["--sv"],
    category=ParameterCategory.REFERENCE,
    value_type=ValueType.INTEGER,
    default_value=None,
    min_value=None,
    max_value=None,
    accepted_values=None,
    description="Style reference algorithm version",
    examples=["--sv 1", "--sv 2"],
    version_compatibility="V5+"
)

STYLE_WEIGHT = ParameterDefinition(
    name="style_weight",
    aliases=["--sw"],
    category=ParameterCategory.REFERENCE,
    value_type=ValueType.INTEGER,
    default_value=100,
    min_value=0,
    max_value=1000,
    accepted_values=None,
    description="Controls the influence strength of style reference",
    examples=["--sw 50", "--sw 200"],
    version_compatibility="V5+"
)

CHARACTER_REFERENCE = ParameterDefinition(
    name="character_reference",
    aliases=["--cref"],
    category=ParameterCategory.REFERENCE,
    value_type=ValueType.STRING,
    default_value=None,
    min_value=None,
    max_value=None,
    accepted_values=None,
    description="Character reference via image URL for character consistency across generations",
    examples=["--cref https://example.com/character.jpg"],
    version_compatibility="V6+"
)

CHARACTER_WEIGHT = ParameterDefinition(
    name="character_weight",
    aliases=["--cw"],
    category=ParameterCategory.REFERENCE,
    value_type=ValueType.INTEGER,
    default_value=100,
    min_value=0,
    max_value=100,
    accepted_values=None,
    description="Character reference weight. Lower values = face only, higher values = includes hair/clothing",
    examples=["--cw 50", "--cw 100"],
    version_compatibility="V6+"
)

# ==============================================================================
# VIDEO GENERATION PARAMETERS
# ==============================================================================
# Source: sref-midjourney.com
# Video generation features added in V6+
# Note: These are for video generation, not to be confused with --video (progress video)

MOTION = ParameterDefinition(
    name="motion",
    aliases=["--motion"],
    category=ParameterCategory.VIDEO,
    value_type=ValueType.STRING,
    default_value="low",
    min_value=None,
    max_value=None,
    accepted_values=["low", "high"],
    description="Controls the amount of motion in video generation",
    examples=["--motion low", "--motion high"],
    version_compatibility="V6+"
)

RAW_VIDEO = ParameterDefinition(
    name="raw",
    aliases=["--raw"],
    category=ParameterCategory.VIDEO,
    value_type=ValueType.BOOLEAN,
    default_value=False,
    min_value=None,
    max_value=None,
    accepted_values=None,
    description="Enables precise motion control for video generation",
    examples=["--raw"],
    version_compatibility="V6+"
)

# ==============================================================================
# SPECIAL FEATURE PARAMETERS
# ==============================================================================
# Sources: sref-midjourney.com, archiobjects.org
# Advanced and specialized parameters for specific use cases
# Note: --weird added in V6, --niji has dedicated anime model versions

NIJI = ParameterDefinition(
    name="niji",
    aliases=["--niji"],
    category=ParameterCategory.SPECIAL,
    value_type=ValueType.INTEGER,
    default_value=None,
    min_value=4,
    max_value=6,
    accepted_values=[4, 5, 6],
    description="Anime/manga style generation using Niji model",
    examples=["--niji 6", "--niji 5"],
    version_compatibility="V4+"
)

PRIVATE = ParameterDefinition(
    name="private",
    aliases=["--p"],
    category=ParameterCategory.SPECIAL,
    value_type=ValueType.BOOLEAN,
    default_value=False,
    min_value=None,
    max_value=None,
    accepted_values=None,
    description="Makes the job private (not visible in public feeds)",
    examples=["--p"],
    version_compatibility="All versions"
)

REPEAT = ParameterDefinition(
    name="repeat",
    aliases=["--r", "--repeat"],
    category=ParameterCategory.SPECIAL,
    value_type=ValueType.INTEGER,
    default_value=1,
    min_value=1,
    max_value=40,
    accepted_values=None,
    description="Generates multiple jobs from a single prompt",
    examples=["--r 4", "--repeat 10"],
    version_compatibility="All versions"
)

STOP = ParameterDefinition(
    name="stop",
    aliases=["--stop"],
    category=ParameterCategory.SPECIAL,
    value_type=ValueType.INTEGER,
    default_value=100,
    min_value=10,
    max_value=100,
    accepted_values=None,
    description="Stops generation early for less detailed results",
    examples=["--stop 50", "--stop 80"],
    version_compatibility="All versions"
)

VIDEO = ParameterDefinition(
    name="video",
    aliases=["--video"],
    category=ParameterCategory.SPECIAL,
    value_type=ValueType.BOOLEAN,
    default_value=False,
    min_value=None,
    max_value=None,
    accepted_values=None,
    description="Saves a progress video of the initial grid generation",
    examples=["--video"],
    version_compatibility="V1-V5"
)

WEIRD = ParameterDefinition(
    name="weird",
    aliases=["--w", "--weird"],
    category=ParameterCategory.SPECIAL,
    value_type=ValueType.INTEGER,
    default_value=0,
    min_value=0,
    max_value=3000,
    accepted_values=None,
    description="Adds quirky, offbeat, unconventional qualities to the generation",
    examples=["--w 500", "--weird 1000"],
    version_compatibility="V6+"
)

# ==============================================================================
# PARAMETER REGISTRY
# ==============================================================================
# Central registry of all parameters for easy lookup and management
# To add new parameters: Define the parameter above, then add to this dictionary

ALL_PARAMETERS = {
    "aspect": ASPECT_RATIO,
    "quality": QUALITY,
    "stylize": STYLIZE,
    "chaos": CHAOS,
    "seed": SEED,
    "no": NO_PARAMETER,
    "version": VERSION,
    "image_weight": IMAGE_WEIGHT,
    "tile": TILE,
    "style": STYLE,
    "fast": FAST,
    "relax": RELAX,
    "turbo": TURBO,
    "style_reference": STYLE_REFERENCE,
    "style_reference_version": STYLE_REFERENCE_VERSION,
    "style_weight": STYLE_WEIGHT,
    "character_reference": CHARACTER_REFERENCE,
    "character_weight": CHARACTER_WEIGHT,
    "motion": MOTION,
    "raw": RAW_VIDEO,
    "niji": NIJI,
    "private": PRIVATE,
    "repeat": REPEAT,
    "stop": STOP,
    "video": VIDEO,
    "weird": WEIRD,
}


class MJParameterSystem:
    """Midjourney Parameter Management System"""

    def __init__(self):
        self.parameters = ALL_PARAMETERS

    def get_parameter(self, name: str) -> Optional[ParameterDefinition]:
        """Get parameter definition by name or alias"""
        # Check direct name match
        if name in self.parameters:
            return self.parameters[name]

        # Check aliases
        for param in self.parameters.values():
            if name in param.aliases:
                return param

        return None

    def get_parameters_by_category(self, category: ParameterCategory) -> List[ParameterDefinition]:
        """Get all parameters in a specific category"""
        return [p for p in self.parameters.values() if p.category == category]

    def validate_parameter_value(self, param_name: str, value: Union[str, int, float]) -> bool:
        """Validate if a value is acceptable for a parameter"""
        param = self.get_parameter(param_name)
        if not param:
            return False

        # Check accepted values list
        if param.accepted_values and value not in param.accepted_values:
            return False

        # Check range for numeric values
        if param.value_type in [ValueType.INTEGER, ValueType.FLOAT, ValueType.RANGE]:
            if param.min_value is not None and value < param.min_value:
                return False
            if param.max_value is not None and value > param.max_value:
                return False

        return True

    def build_parameter_string(self, **kwargs) -> str:
        """Build a parameter string from keyword arguments"""
        parts = []
        for key, value in kwargs.items():
            param = self.get_parameter(key)
            if not param:
                continue

            # Use the first alias (usually the short form)
            alias = param.aliases[0]

            # Boolean parameters don't need values
            if param.value_type == ValueType.BOOLEAN:
                if value:
                    parts.append(alias)
            else:
                parts.append(f"{alias} {value}")

        return " ".join(parts)

    def get_all_categories(self) -> List[str]:
        """Get list of all parameter categories"""
        return [cat.value for cat in ParameterCategory]

    def search_parameters(self, keyword: str) -> List[ParameterDefinition]:
        """Search parameters by keyword in name or description"""
        keyword = keyword.lower()
        results = []
        for param in self.parameters.values():
            if (keyword in param.name.lower() or
                keyword in param.description.lower() or
                any(keyword in alias.lower() for alias in param.aliases)):
                results.append(param)
        return results


# ==============================================================================
# UPDATE INSTRUCTIONS
# ==============================================================================
"""
HOW TO UPDATE THIS MODULE:
==========================

1. Check for new parameters:
   - Official Midjourney Discord announcements
   - https://docs.midjourney.com (official documentation)
   - Community resources (sref-midjourney.com, learningprompt.wiki)

2. When adding a new parameter:
   a. Create a ParameterDefinition constant in the appropriate section
   b. Add it to the ALL_PARAMETERS dictionary
   c. Update the version_compatibility field
   d. Add examples showing actual usage
   e. Update the VERSION COVERAGE section in the header docstring

3. When updating existing parameters:
   a. Update the Last Updated date in the header
   b. Document what changed in git commit message
   c. Update version_compatibility if needed
   d. Add new examples if behavior changed

4. Testing after updates:
   - Run: python3 test_mj_parameters.py
   - Verify all tests pass
   - Test new parameters with actual Midjourney API if possible

5. Version tracking:
   - Keep version_compatibility field accurate
   - Mark deprecated parameters with note in description
   - Don't remove old parameters (mark as deprecated instead)

COMMON PARAMETER PATTERNS:
=========================
- Boolean flags: Use ValueType.BOOLEAN, no min/max values
- Numeric ranges: Set min_value and max_value
- Enum values: Use accepted_values list
- String inputs: Use ValueType.STRING, accepted_values if limited options

EXAMPLE NEW PARAMETER:
=====================
NEW_PARAM = ParameterDefinition(
    name="new_param",
    aliases=["--np", "--new-param"],
    category=ParameterCategory.SPECIAL,
    value_type=ValueType.INTEGER,
    default_value=50,
    min_value=0,
    max_value=100,
    accepted_values=None,
    description="Description of what this parameter does",
    examples=["--np 50", "--new-param 75"],
    version_compatibility="V8+"
)

Then add to ALL_PARAMETERS:
    "new_param": NEW_PARAM,
"""
