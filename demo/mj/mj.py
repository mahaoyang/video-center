import http.client
import json
import mimetypes
import time
import urllib.request
import os
from codecs import encode


def get_token() -> str:
    token = (os.getenv("MJ_API_TOKEN") or os.getenv("YUNWU_MJ_KEY") or "").strip()
    if not token:
        raise RuntimeError("Missing token: set MJ_API_TOKEN or YUNWU_MJ_KEY")
    return token


def getimg(uid):
    conn = http.client.HTTPSConnection("yunwu.ai")
    headers = {
        "Authorization": f"Bearer {get_token()}",
        "Content-type": "multipart/form-data",
    }

    # NOTE (yunwu.ai /mj/task/{taskId}/fetch):
    # - HTTP 200
    # - Content-Type: application/json
    # - Body example (fields vary by phase):
    #   {
    #     "id":"1767653499730598",
    #     "description":"选图操作成功",
    #     "status":"",              # may be "" during processing
    #     "progress":"0%",          # string percent
    #     "imageUrl":"",            # empty until ready
    #     "failReason":""
    #   }
    # - When ready: status="SUCCESS", progress="100%", imageUrl="<png url>"
    conn.request("GET", "/mj/task/{uid}/fetch".format(uid=uid), body=None, headers=headers)
    res = conn.getresponse()
    raw_body = res.read().decode("utf-8")
    if res.status != 200:
        print(f"Request failed with status {res.status}: {raw_body}")
        return None

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        print(f"Unable to parse response as JSON: {raw_body}")
        return None

    image_url = payload.get("imageUrl")
    if not image_url:
        print(f"No imageUrl found in response: {raw_body}")
        return None

    filename = f"{int(time.time() * 1000)}.png"
    try:
        with urllib.request.urlopen(image_url) as remote, open(filename, "wb") as out_file:
            out_file.write(remote.read())
    except Exception as exc:
        print(f"Failed to download image: {exc}")
        return None

    print(f"Image downloaded to {filename}")
    return image_url


def gen_img():
    conn = http.client.HTTPSConnection("yunwu.ai")
    # NOTE (yunwu.ai /mj/submit/imagine):
    # - HTTP 200
    # - Content-Type: text/plain; charset=utf-8  (body is still JSON)
    # - Body example:
    #   {"code":1,"description":"提交成功","result":"1767652132905893","properties":{"discordInstanceId":"...","discordChannelId":"..."}}
    # - `result` is the taskId; then query progress via GET /mj/task/{taskId}/fetch
    payload = json.dumps({
        "base64Array": [],
        "notifyHook": "",
        "prompt": prompt_1,
        "state": "",
        "botType": "MID_JOURNEY"
    })
    headers = {
        "Authorization": f"Bearer {get_token()}",
        "Content-Type": "application/json"
    }
    conn.request("POST", "/mj/submit/imagine", payload, headers)
    res = conn.getresponse()
    data = res.read()
    print(data.decode("utf-8"))


def upscale_img(task_id: str, index: int = 1):
    conn = http.client.HTTPSConnection("yunwu.ai")
    # NOTE (yunwu.ai /mj/submit/action) for Upscale (U1..U4):
    # - HTTP 200
    # - Content-Type: text/plain; charset=utf-8  (body is still JSON)
    # - Request payload example:
    #   {
    #     "chooseSameChannel": true,
    #     "customId": "MJ::JOB::upsample::{index}::{taskId}",
    #     "taskId": "{taskId}",
    #     "notifyHook": "",
    #     "state": ""
    #   }
    # - Body example:
    #   {"code":1,"description":"选图操作成功","properties":null,"result":"1767653499730598"}
    # - `result` is the NEW taskId; then query progress via GET /mj/task/{taskId}/fetch
    payload = json.dumps({
        "chooseSameChannel": True,
        "customId": f"MJ::JOB::upsample::{index}::{task_id}",
        "taskId": task_id,
        "notifyHook": "",
        "state": "",
    })
    headers = {
        "Authorization": f"Bearer {get_token()}",
        "Content-Type": "application/json"
    }
    conn.request("POST", "/mj/submit/action", payload, headers)
    res = conn.getresponse()
    data = res.read()
    print(data.decode("utf-8"))


def read_image_base64(path):
    """Read an image file and return a base64-encoded string."""
    import base64
    with open(path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


# print(read_image_base64('1.png'))
# prompt_1 = 'https://mjcdn.googlec.cc/attachments/2025/12/04/3aa2f1a5-bbdd-462a-a7f2-36513370358e.png, A majestic golden Buddha statue meditating in the center, glowing with divine aura, surrounded by hundreds of smaller golden Buddhas floating in the air, ascending into the sky. Background is a deep blue cosmic starry night with nebulae. Cinematic lighting, dramatic god rays shining down from above, volumetric fog, swirling golden mist and sparkles, bioluminescent particles. Hyper-realistic, 3D render style, octane render, 8k resolution, spiritual atmosphere, serene and holy. --ar 16:9 --ar 16:9 --v 7'
# gen_img()

uid ="1764856278959232"
getimg(uid)
