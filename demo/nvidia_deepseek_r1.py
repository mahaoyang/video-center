"""
NVIDIA NIM - 多模型推理
支持: minimax-m2.1, glm4.7, deepseek-v3.2, deepseek-r1
"""

import os
import sys
from openai import OpenAI

MODELS = {
    "minimax": "minimaxai/minimax-m2.1",
    "glm": "zhipu-ai/glm-4.7",
    "deepseek": "deepseek-ai/deepseek-v3.2",
    "r1": "deepseek-ai/deepseek-r1",
}

model_key = sys.argv[1] if len(sys.argv) > 1 else "deepseek"
model = MODELS.get(model_key, model_key)

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.getenv("NV_KEY")
)

print(f"Model: {model}")
completion = client.chat.completions.create(
    model=model,
    messages=[{"role": "user", "content": "What is 2+2?"}],
    temperature=0.6,
    top_p=0.7,
    max_tokens=4096,
    stream=False
)

reasoning = getattr(completion.choices[0].message, "reasoning_content", None)
if reasoning:
    print("Reasoning:", reasoning)
print("Answer:", completion.choices[0].message.content)
