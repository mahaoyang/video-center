/**
 * 图片处理工具
 * 用于四宫格切图
 */

/**
 * 将四宫格图片切分成4张独立图片
 * @param imageUrl 四宫格图片URL
 * @returns 4张图片的Blob数组
 */
export async function splitGridImage(imageUrl: string): Promise<Blob[]> {
  // 加载图片
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const width = bitmap.width / 2;
  const height = bitmap.height / 2;

  const images: Blob[] = [];

  // 切分4张图片
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * width;
    const y = Math.floor(i / 2) * height;

    // 创建canvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    // 绘制裁剪后的图片
    ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);

    // 转换为blob
    const imageBlob = await canvas.convertToBlob({ type: 'image/png' });
    images.push(imageBlob);
  }

  return images;
}

/**
 * 将图片文件转换为base64
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 下载图片
 */
export function downloadImage(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
