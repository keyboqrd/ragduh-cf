# 本地部署到 Cloudflare

## 前置条件

1. 安装 Node.js 和 npm
2. 安装 Wrangler CLI：`npm install -g wrangler`
3. 登录 Cloudflare：`wrangler login`

## 配置环境变量

### 1. 获取必要的值

```bash
# 登录 Cloudflare Dashboard 获取
# - Account ID: https://dash.cloudflare.com/
# - 创建 AI Gateway 后获取 Gateway ID
```

### 2. 创建 .dev.vars 文件

```bash
cd ragduh-api
cat > .dev.vars << EOF
CF_ACCOUNT_ID="b5594238c553f425aba4f73694ff8bd4"
CF_GATEWAY_ID="ragduh-gateway"
CF_AIG_TOKEN="your_ai_gateway_token"
API_KEY="your_api_key"
EOF
```

### 3. 替换 wrangler.toml 中的变量

```bash
# 定义变量
D1_DATABASE_ID="your-d1-database-id"
API_KEY="your_api_key"
CF_AIG_TOKEN="your_ai_gateway_token"
CF_ACCOUNT_ID="b5594238c553f425aba4f73694ff8bd4"

# 替换 wrangler.toml 中的占位符
sed -i "s|database_id = \"\$D1_DATABASE_ID\"|database_id = \"${D1_DATABASE_ID}\"|" wrangler.toml
sed -i "s|CF_ACCOUNT_ID = \"\$CF_ACCOUNT_ID\"|CF_ACCOUNT_ID = \"${CF_ACCOUNT_ID}\"|" wrangler.toml
sed -i "s|API_KEY = \"\$API_KEY\"|API_KEY = \"${API_KEY}\"|" wrangler.toml
sed -i "s|CF_AIG_TOKEN = \"\$CF_AIG_TOKEN\"|CF_AIG_TOKEN = \"${CF_AIG_TOKEN}\"|" wrangler.toml
```

## 创建 D1 数据库

```bash
# 创建数据库
wrangler d1 create ragduh-db

# 输出：
# ✅ Successfully created database 'ragduh-db' with id 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
```

将输出的 `database_id` 替换到上面的 `D1_DATABASE_ID` 变量中。

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
cd ../ragduh-app
npm install
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

## 验证部署

```bash
# 测试健康检查
curl https://ragduh-api.alpiaco.workers.dev/health

# 测试 API（替换 API_KEY）
curl -H "Authorization: Bearer your_api_key" https://ragduh-api.alpiaco.workers.dev/api/namespaces
```
