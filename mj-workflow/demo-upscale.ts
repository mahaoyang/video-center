/**
 * MJ 扩图 Demo
 * 将 Python 的 http.client 代码迁移到 TypeScript
 */

interface UpscaleRequest {
  chooseSameChannel: boolean;
  customId: string;
  taskId: string;
  notifyHook: string;
  state: string;
}

interface UpscaleResponse {
  code: number;
  description: string;
  result?: any;
}

async function upscaleImage(token: string, requestData: UpscaleRequest): Promise<UpscaleResponse> {
  const url = 'https://yunwu.ai/mj/submit/action';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('扩图请求失败:', error);
    throw error;
  }
}

// 示例使用
async function main() {
  const token = process.env.YUNWU_MJ_KEY || process.env.MJ_API_TOKEN || ''; // 建议放到 .env.local
  if (!token) {
    throw new Error('Missing token: set MJ_API_TOKEN or YUNWU_MJ_KEY');
  }

  const requestData: UpscaleRequest = {
    chooseSameChannel: true,
    customId: 'MJ::JOB::upsample::2::3dbbd469-36af-4a0f-8f02-df6c579e7011',
    taskId: '14001934816969359',
    notifyHook: '',
    state: '',
  };

  try {
    const result = await upscaleImage(token, requestData);
    console.log('扩图结果:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('执行失败:', error);
  }
}

// 如果直接运行此文件
if (import.meta.main) {
  main();
}

export { upscaleImage, type UpscaleRequest, type UpscaleResponse };
