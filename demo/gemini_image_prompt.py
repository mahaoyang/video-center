"""Gemini 多模态识图 - 反推图片提示词"""
import os
import base64
from google import genai
from dotenv import load_dotenv

load_dotenv('.env.local')

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def image_to_prompt(image_path: str) -> str:
    """从图片反推 Midjourney 风格的提示词"""
    with open(image_path, 'rb') as f:
        image_data = base64.standard_b64encode(f.read()).decode('utf-8')

    response = client.models.generate_content(
        model='gemini-2.0-flash-exp',
        contents=[
            {
                'parts': [
                    {'text': 'Analyze this image and generate a Midjourney-style prompt that could recreate it. Include style, mood, lighting, composition, and technical parameters like --ar, --v, --style. Output ONLY the prompt, nothing else.'},
                    {'inline_data': {'mime_type': 'image/png', 'data': image_data}}
                ]
            }
        ]
    )
    return response.text.strip()

if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print("Usage: python gemini_image_prompt.py <image_path>")
        sys.exit(1)

    prompt = image_to_prompt(sys.argv[1])
    print(f"Generated Prompt:\n{prompt}")
