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

## Cloudflare 服务

- **Workers** - 运行 API 代码
- **Pages** - 托管前端应用
- **D1** - SQLite 数据库
- **Vectorize** - 向量数据库
- **R2** - 对象存储（文档原始内容备份）
- **Workers AI** - 嵌入模型推理
- **Queues** - 异步任务队列（文档嵌入、重新摄入）
- **AI Gateway** - AI 模型网关

## 使用的模型

| 类型 | 模型 | 说明 |
|------|------|------|
| 嵌入模型 | `@cf/baai/bge-m3` | BGE-M3 多语言向量嵌入 |
| Reranker | `@cf/baai/bge-reranker-base` | BGE 重排序模型 |
| LLM | `google:gemma-3-27b-it` | Google Gemma 3 27B 指令模型 |

## Queues 使用

| 队列名称 | 用途 | 消费者配置 |
|---------|------|-----------|
| `ragduh-queue` | 文档摄入任务（嵌入、分块） | max_batch_size=10, max_batch_timeout=30s, max_retries=1 |
| `ragduh-dlq` | 死信队列（处理失败的任务） | max_batch_size=10, max_retries=0 |

**工作流程：**
1. API 接收文档上传请求后，将原始文件上传至 **R2**，创建 ingest job 并发送到 `ragduh-queue`
2. Ingest Worker 消费队列，执行：从 **R2** 获取原始文件 → 文档分块 → 生成 embeddings → 写入 D1 → 写入 Vectorize
3. 失败任务进入 `ragduh-dlq` 死信队列
4. 支持 re-ingest 功能重新处理任务（同样从 **R2** 获取内容）
