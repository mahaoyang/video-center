# 图床上传工具

## 快速开始

```bash
# 上传图片
python3 upload.py <图片路径>

# 示例
python3 upload.py 1.png
```

## 功能

- ✓ 支持PNG、JPG等图片格式
- ✓ 自动从.env.local读取API密钥
- ✓ 返回可访问的图片URL

## API信息

- 端点: `https://imageproxy.zhongzhuan.chat/api/upload`
- 认证: Bearer Token (存储在.env.local)
- 响应: JSON格式，包含图片URL和创建时间

## 安全说明

- API密钥存储在`.env.local`文件中
- `.env.local`已添加到`.gitignore`，不会被提交到Git
- 请勿在代码中硬编码API密钥

## 测试结果

所有测试通过 ✓
- 小图片 (1KB) ✓
- 中等图片 (1.3MB) ✓
- 大图片 (5.7MB) ✓

详见 `README_TEST.md`
