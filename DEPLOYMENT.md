# GitHub Actions 部署指南

## 工作流列表

| 工作流 | 文件 | 用途 |
|--------|------|------|
| Deploy App | `deploy.yml` | 部署前后端到生产环境 |
| Deploy E2E API | `deploy-e2e.yml` | 部署 E2E 测试后端 |
| Migrate D1 | `d1-migrate.yml` | 执行 D1 数据库迁移 |

## 配置 GitHub Secrets

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加：

| Secret | 说明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `API_KEY` | API 认证密钥 |
| `CF_AIG_TOKEN` | AI Gateway Token |
| `D1_DATABASE_ID` | D1 数据库 ID (main) |
| `D1_DATABASE_ID_E2E` | D1 数据库 ID (e2e) |

| Variable | 说明 | 默认值 |
|----------|------|--------|
| `VITE_API_URL` | 前端 API 地址 | `https://ragduh-api.alpiaco.workers.dev` |

## 获取 Cloudflare API Token

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **My Profile → API Tokens**
3. 点击 **Create Token**
4. 选择 **Edit Cloudflare Workers** 模板
5. 创建并复制 token

**所需权限：**
- Account.Cloudflare Workers: Edit
- Account.Cloudflare Pages: Edit
- Account.D1: Edit
- Account.Vectorize: Edit

## 创建 D1 数据库

```bash
# 创建生产环境数据库
wrangler d1 create ragduh-db

# 创建 E2E 测试数据库
wrangler d1 create ragduh-db-test
```

将输出的 `database_id` 添加到 GitHub Secrets。

## 配置 Workflow 权限

在 GitHub 仓库的 **Settings → Actions → General** 中：

1. 找到 **Workflow permissions**
2. 选择 **Read and write permissions**
3. 保存

## 部署流程

### 首次部署

1. 执行数据库迁移：Actions → **Migrate D1** → Run workflow → 选择 `main`
2. 部署应用：Actions → **Deploy App** → Run workflow
3. 配置 AI Gateway Provider（见下方）

### 日常部署

Actions → **Deploy App** → Run workflow

### E2E 环境部署

Actions → **Deploy E2E API** → Run workflow

## 配置 AI Gateway Provider

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages → AI → AI Gateway**
3. 点击 `ragduh-gateway`
4. 进入 **Providers** 标签页
5. 配置 Google Generative AI，输入 API Key

**获取 Google API Key：**
1. 访问 [Google AI Studio](https://aistudio.google.com/apikey)
2. 创建或选择项目
3. 生成 API Key
