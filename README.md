# RagDuh - Cloudflare RAG 服务

基于 Cloudflare Workers 的 RAG（检索增强生成）服务，支持文档摄入、向量化检索和智能问答。

## 项目结构

```
ragduh-cf/
├── ragduh-api/          # 后端 API (Cloudflare Workers)
│   ├── src/
│   ├── wrangler.toml    # 主环境配置
│   ├── wrangler.e2e.toml # E2E 测试环境配置
│   └── LOCAL_DEPLOY.md  # 本地部署指南
├── ragduh-app/          # 前端 React 应用
│   └── src/
├── DEPLOYMENT.md        # GitHub Actions 部署指南
└── .github/workflows/
    ├── deploy.yml       # 部署前后端
    ├── deploy-e2e.yml   # 部署 E2E 后端
    └── d1-migrate.yml   # D1 数据库迁移
```

## 快速开始

### 本地部署到 Cloudflare

参见 [LOCAL_DEPLOY.md](ragduh-api/LOCAL_DEPLOY.md)

```bash
cd ragduh-api
wrangler deploy
```

### GitHub Actions 部署

参见 [DEPLOYMENT.md](DEPLOYMENT.md)

1. 配置 GitHub Secrets
2. 执行 D1 Migration
3. 运行 Deploy App 工作流

## 文档

| 文档 | 说明 |
|------|------|
| [LOCAL_DEPLOY.md](ragduh-api/LOCAL_DEPLOY.md) | 本地部署到 Cloudflare 远程环境 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | GitHub Actions 自动部署 |

## Cloudflare 服务

- **Workers** - 运行 API 代码
- **Pages** - 托管前端应用
- **D1** - SQLite 数据库
- **Vectorize** - 向量数据库
- **Workers AI** - 嵌入模型推理
- **Queues** - 异步任务队列
- **AI Gateway** - AI 模型网关

## 使用的模型

| 类型 | 模型 | 说明 |
|------|------|------|
| 嵌入模型 | `@cf/baai/bge-m3` | BGE-M3 多语言向量嵌入 |
| Reranker | `@cf/baai/bge-reranker-base` | BGE 重排序模型 |
| LLM | `google:gemma-3-27b-it` | Google Gemma 3 27B 指令模型 |
