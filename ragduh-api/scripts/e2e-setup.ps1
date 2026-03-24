# E2E 测试设置脚本 (PowerShell)

Write-Host "=== Ragduh API E2E Setup ===" -ForegroundColor Green
Write-Host ""

# 应用数据库迁移
Write-Host "Applying database migrations..." -ForegroundColor Cyan
wrangler d1 migrations apply ragduh-db-test --remote --config wrangler.e2e.toml

if ($LASTEXITCODE -ne 0) {
    Write-Host "Migration failed" -ForegroundColor Red
    exit 1
}

# 部署 Worker
# wrangler deploy 会自动加载 .dev.vars (包含 CF_AIG_TOKEN)
Write-Host "Deploying worker..." -ForegroundColor Cyan
Write-Host "Note: .dev.vars must contain CF_AIG_TOKEN" -ForegroundColor Yellow
wrangler deploy --config wrangler.e2e.toml

Write-Host ""
Write-Host "=== Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Run tests with:" -ForegroundColor Cyan
Write-Host '  npm run test:e2e'
