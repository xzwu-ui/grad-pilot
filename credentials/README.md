# Gmail OAuth 本地凭据

此目录只保存 Google OAuth **桌面应用**客户端文件。`credentials/*.json` 已被 Git 忽略，不要提交、分享或上传到第三方服务。

## 一次性配置

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建或选择一个个人项目。
2. 启用 [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)。
3. 配置 OAuth consent screen。个人测试阶段使用测试模式时，将自己的 Gmail 地址加入测试用户。
4. 创建 OAuth Client ID，应用类型选择 **Desktop app**，下载客户端 JSON。
5. 将下载的文件保存为：

```text
grad-pilot/credentials/gmail-oauth.json
```

6. 回到项目根目录安装依赖并运行：

```bash
uv sync
uv run python scripts/import_gmail.py fetch
```

首次运行会打开浏览器完成授权。工具只申请：

```text
https://www.googleapis.com/auth/gmail.readonly
```

缓存令牌保存在 `.state/gmail-token.json`，该目录已被 Git 忽略。令牌失效或授权被撤销时，删除本地缓存令牌后重新运行 `fetch` 即可重新授权；不要删除 OAuth 客户端之外的任何项目文件。

Google 的测试用户、授权有效期和应用验证要求可能调整，以 [Google OAuth 文档](https://developers.google.com/identity/protocols/oauth2/native-app) 和 [Gmail 权限范围说明](https://developers.google.com/gmail/api/auth/scopes) 为准。

## 权限边界

- `fetch` 只读取你明确运行时匹配的邮件，不发送、删除、归档或修改邮件。
- 解析结果只生成 `out/gmail-import/` 下的本地候选与审核页面。
- 只有审核页导出的确认 JSON，配合 `apply --write-private`，才会修改申请数据库。
- 不要把真实 OAuth JSON、令牌、邮件导出或审核文件发送到 issue、聊天或公开仓库。
