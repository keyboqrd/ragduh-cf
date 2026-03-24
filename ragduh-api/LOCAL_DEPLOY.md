# 本地部署到 Cloudflare

## 前置条件

1. 安装 Node.js 和 npm
2. 安装 Wrangler CLI：`npm install -g wrangler`
3. 登录 Cloudflare：`wrangler login`

## 配置环境变量

复制 `.env.example` 到 `.dev.vars`：

```bash
cd ragduh-api
cp .env.example .dev.vars
```

编辑 `.dev.vars`，填入配置：

```bash
CF_ACCOUNT_ID="your_cloudflare_account_id"
CF_AIG_TOKEN="your_ai_gateway_token"
API_KEY="your_api_key"
```

## 创建 D1 数据库

```bash
# 创建数据库
wrangler d1 create ragduh-db

# 输出：
# ✅ Successfully created database 'ragduh-db' with id 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
```

将 `database_id` 记录到 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "ragduh-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

## 执行数据库迁移

```bash
wrangler d1 execute ragduh-db --remote --file=migrations/0000_initial_schema.sql
```

## 部署到 Cloudflare

```bash
# 部署后端
cd ragduh-api
wrangler deploy

# 部署前端
cd ragduh-app
npm run build
wrangler pages deploy ./dist --project-name=ragduh-app
```

## 配置 AI Gateway Provider

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages → AI → AI Gateway**
3. 点击 `ragduh-gateway`
4. 进入 **Providers** 标签页
5. 配置 Google Generative AI，输入 API Key

**获取 Google API Key：** [Google AI Studio](https://aistudio.google.com/apikey)
