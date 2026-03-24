#!/bin/bash
# E2E 测试设置脚本 (Bash)

set -e

echo "=== Ragduh API E2E Setup ==="
echo ""

# 应用数据库迁移
echo "Applying database migrations..."
wrangler d1 migrations apply ragduh-db-test --remote --config wrangler.e2e.toml

# 部署 Worker
echo "Deploying worker..."
wrangler deploy --config wrangler.e2e.toml
