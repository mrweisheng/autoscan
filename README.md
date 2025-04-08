# 自动扫描服务

这是一个自动扫描和登录服务的Node.js应用。

## 项目结构

- `autoLogin.js` - 主应用程序文件
- `importShopData.js` - 导入店铺数据的脚本
- `uploads/` - 上传文件存储目录

## 功能

- 账号登录管理
- 文件和图片上传
- 店铺数据导入

## 安装

```bash
npm install
```

## 运行

```bash
npm start
```

开发模式：

```bash
npm run dev
```

## 环境变量

请参考 `.env.example` 文件设置必要的环境变量。

## 修改记录

### 2025-04-08

- 修复了上传图片API中的错误：删除了不必要的`imageSize`函数调用，因为不需要返回图片尺寸信息。错误信息为：`Error in uploadImage: imageSize is not a function`。
- 优化了图片下载功能：现在系统会根据文件扩展名直接从正确的目录查找文件（图片文件从`uploads/images`目录，其他文件从`uploads`目录），并设置了正确的Content-Type。修复了下载链接显示"File not found"的错误。 