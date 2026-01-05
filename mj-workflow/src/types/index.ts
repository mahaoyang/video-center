/**
 * MJ Workflow 类型定义
 */

export interface MJConfig {
  apiUrl: string;
  token: string;
}

// 图片上传响应
export interface UploadImageResponse {
  code: number;
  description: string;
  result?: {
    url: string; // preferred URL (CDN preferred, local fallback)
    cdnUrl?: string;
    localUrl: string; // e.g. /uploads/<key>
    localPath: string; // server-side path
    localKey: string; // server-side key for deletion
  };
}

// 反推提示词请求
export interface DescribeRequest {
  base64?: string; // 图片base64
  imageUrl?: string; // 或图片URL
}

// 识图（多模态 chat/completions）请求
export interface VisionDescribeRequest {
  imageUrl: string;
  question?: string;
  model?: string;
}

export interface VisionDescribeResponse {
  code: number;
  description: string;
  result?: {
    text: string;
    raw: unknown;
  };
}

// 反推提示词响应
export interface DescribeResponse {
  code: number;
  description: string;
  result?: {
    prompt: string;
  };
}

// 生图请求
export interface ImagineRequest {
  prompt: string;
  base64Array?: string[]; // 可选：参考图（base64，不含 data: 前缀）
  notifyHook?: string;
  state?: string;
}

// 生图响应
export interface ImagineResponse {
  code: number;
  description: string;
  result?: {
    taskId: string;
    imageUrl?: string; // 四宫格图片URL
  };
}

// 扩图请求
export interface UpscaleRequest {
  chooseSameChannel: boolean;
  customId: string; // 格式: MJ::JOB::upsample::{index}::{messageId}
  taskId: string;
  notifyHook?: string;
  state?: string;
}

// 扩图响应
export interface UpscaleResponse {
  code: number;
  description: string;
  result?: {
    taskId: string;
    imageUrl?: string;
  };
}

// 任务查询响应
export interface TaskQueryResponse {
  code: number;
  description: string;
  result?: {
    status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILURE';
    imageUrl?: string;
    progress?: number;
    failReason?: string;
  };
}
