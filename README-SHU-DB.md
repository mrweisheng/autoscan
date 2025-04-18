# 被封禁账号API双数据库配置说明

## 概述
本次更新使 `/accounts/random-banned` 和 `/accounts/mark-handled` 这两个API支持从多个数据库源获取和处理账号数据。其他API功能不受影响，仍然只使用主数据库。

## 配置选项
在 `.env` 文件中添加以下配置：

```
# Shu数据库配置
MONGODB_SHU_URI=mongodb://test:test@104.37.187.30:27017/whatsapp_manager_test

# 账号API数据源选择：main=主数据库, shu=Shu数据库, both=两个数据库
ACCOUNTS_API_SOURCE=main
```

### 数据源配置选项
- `main`: 只使用主数据库 (默认值)
- `shu`: 只使用Shu数据库
- `both`: 同时使用两个数据库，结果会合并去重，并记录来源

## 功能说明

### 获取被封禁账号 `/accounts/random-banned`
此API有以下行为变化：
1. 按照 `ACCOUNTS_API_SOURCE` 配置选择数据源
2. 在使用 `both` 配置时，会合并两个数据库的结果，并通过 `phoneNumber` 字段去重
3. 请求日志会记录当前使用的数据源
4. 缓存机制保持不变，包括1小时的有效期和顺序返回策略

### 标记账号为已处理 `/accounts/mark-handled`
此API有以下行为变化：
1. 按照 `ACCOUNTS_API_SOURCE` 配置选择数据源更新账号状态
2. 在使用 `both` 配置时，会先尝试更新主数据库，如果未找到记录，再尝试更新Shu数据库
3. 请求日志会记录在哪个数据库中成功更新了账号状态

## 测试方法
使用项目根目录下的测试脚本进行测试：

```bash
node test/test-dual-db.js
```

可以修改 `.env` 文件中的 `ACCOUNTS_API_SOURCE` 配置，切换不同的数据源进行测试。

## 注意事项
1. 此配置更改仅影响 `/accounts/random-banned` 和 `/accounts/mark-handled` 这两个API
2. 所有其他API继续只使用主数据库
3. 当只选择一个数据库时，这两个API会使用同一个数据库，不会混用
4. 请确保在使用Shu数据库或both配置时，Shu数据库能够正常连接 