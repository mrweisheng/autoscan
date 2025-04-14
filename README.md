# 自动扫描服务

这是一个自动扫描和登录服务的Node.js应用。

## 项目结构

项目已重构为模块化结构，包含以下主要目录：

- `config/` - 配置文件目录
  - `database.js` - 数据库连接配置
  - `logger.js` - 日志配置
  - `multer.js` - 文件上传配置
  - `index.js` - 配置模块入口
  
- `models/` - 数据库模型目录
  - `Account.js` - 账号模型
  - `UserLoginStatus.js` - 用户登录状态模型
  - `Shop.js` - 店铺模型
  - `ShopProduct.js` - 商品模型
  - `index.js` - 模型模块入口

- `services/` - 业务逻辑层目录
  - `AccountService.js` - 账号相关服务
  - `LoginService.js` - 登录相关服务
  - `FileService.js` - 文件处理服务
  - `ShopService.js` - 店铺和商品服务
  - `index.js` - 服务模块入口

- `controllers/` - 控制器目录
  - `AccountController.js` - 账号控制器
  - `LoginController.js` - 登录控制器
  - `FileController.js` - 文件控制器
  - `ShopController.js` - 店铺控制器
  - `index.js` - 控制器模块入口

- `routes/` - 路由目录
  - `accountRoutes.js` - 账号相关路由
  - `loginRoutes.js` - 登录相关路由
  - `fileRoutes.js` - 文件相关路由
  - `shopRoutes.js` - 店铺相关路由
  - `index.js` - 路由模块入口

- `utils/` - 工具函数目录
  - `helper.js` - 通用辅助函数

- `uploads/` - 上传文件存储目录
  - `images/` - 图片文件存储目录

- `index.js` - 应用主入口文件

## 功能

- 账号登录管理
- 文件和图片上传
- 店铺数据导入
- 随机获取商品

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
- 新增了随机获取商品API：`GET /products/random`，从数据库随机返回一条商品记录。采用MongoDB聚合管道和`$sample`操作符实现真随机性，支持高并发请求。
- 重构了代码结构：将原本庞大的`autoLogin.js`拆分为多个模块，提高了代码的可维护性和可读性。 