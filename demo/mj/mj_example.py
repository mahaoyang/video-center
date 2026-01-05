"""
Example usage of the Midjourney Parameter System
"""

from .mj_parameters import MJParameterSystem, ParameterCategory

# Initialize the parameter system
mj = MJParameterSystem()

# Example 1: Get parameter information
print("=== Example 1: Get Parameter Info ===")
quality_param = mj.get_parameter("quality")
print(f"Parameter: {quality_param.name}")
print(f"Aliases: {quality_param.aliases}")
print(f"Description: {quality_param.description}")
print(f"Accepted values: {quality_param.accepted_values}")
print(f"Examples: {quality_param.examples}")
print()

# Example 2: Get parameters by category
print("=== Example 2: Get Style Parameters ===")
style_params = mj.get_parameters_by_category(ParameterCategory.STYLE)
for param in style_params:
    print(f"- {param.name}: {param.description}")
print()

# Example 3: Validate parameter values
print("=== Example 3: Validate Parameter Values ===")
print(f"Is quality=2 valid? {mj.validate_parameter_value('quality', 2)}")
print(f"Is quality=5 valid? {mj.validate_parameter_value('quality', 5)}")
print(f"Is chaos=50 valid? {mj.validate_parameter_value('chaos', 50)}")
print(f"Is chaos=150 valid? {mj.validate_parameter_value('chaos', 150)}")
print()

# Example 4: Build parameter string
print("=== Example 4: Build Parameter String ===")
params = mj.build_parameter_string(
    aspect="16:9",
    quality=2,
    stylize=750,
    chaos=30,
    seed=123456
)
print(f"Generated parameters: {params}")
print()

# Example 5: Search parameters
print("=== Example 5: Search Parameters ===")
results = mj.search_parameters("style")
print("Parameters related to 'style':")
for param in results:
    print(f"- {param.name} ({', '.join(param.aliases)})")
print()

# Example 6: Get all categories
print("=== Example 6: All Categories ===")
categories = mj.get_all_categories()
print(f"Available categories: {', '.join(categories)}")
print()

# Example 7: Build a complete prompt with parameters
print("=== Example 7: Complete Prompt Example ===")
prompt = "A majestic mountain landscape at sunset"
params = mj.build_parameter_string(
    aspect="16:9",
    quality=1,
    stylize=500,
    version=7,
    no="people, buildings"
)
full_prompt = f"{prompt} {params}"
print(f"Full prompt: {full_prompt}")
print()

# Example 8: Get reference parameters
print("=== Example 8: Reference Parameters ===")
ref_params = mj.get_parameters_by_category(ParameterCategory.REFERENCE)
for param in ref_params:
    print(f"- {param.name}: {param.description}")
    print(f"  Examples: {', '.join(param.examples)}")
print()

# Example 9: Get special feature parameters
print("=== Example 9: Special Features ===")
special_params = mj.get_parameters_by_category(ParameterCategory.SPECIAL)
for param in special_params:
    print(f"- {param.name} ({', '.join(param.aliases)}): {param.description}")
