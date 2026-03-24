import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NamespaceList } from './components/NamespaceList'
import { Card, CardContent } from './components/ui/card'
import { Input } from './components/ui/input'
import { Button } from './components/ui/button'
import { Label } from './components/ui/label'
import { useApiKey } from './context/ApiKeyContext'

function App() {
  const navigate = useNavigate()
  const { apiKey, setApiKey, isLoading } = useApiKey()
  const [error, setError] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  const handleSaveApiKey = () => {
    setApiKey(apiKeyInput.trim())
    setIsEditing(false)
  }

  const handleSelectNamespace = (id: string, _name: string | null) => {
    navigate(`/namespace/${id}`)
  }

  const handleError = (error: string) => {
    setError(error)
  }

  // 等待 API key 加载完成
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="p-6 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">加载中...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // 没有 token 时，只显示 API key 输入页面
  if (!apiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="p-6 flex flex-col gap-4">
            <h1 className="text-2xl font-bold text-center">RagDuh</h1>
            <p className="text-sm text-muted-foreground text-center">
              请输入 API 密钥以继续
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="api-key-input">API 密钥</Label>
              <Input
                id="api-key-input"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="请输入 API 密钥"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveApiKey()
                }}
              />
              <Button onClick={handleSaveApiKey}>
                确认
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-muted/50 py-3 px-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl font-bold">RagDuh</h1>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">API 密钥：</label>
            {isEditing ? (
              <>
                <Input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="请输入 API 密钥"
                  className="w-48 h-8 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveApiKey()
                    if (e.key === 'Escape') setIsEditing(false)
                  }}
                />
                <Button size="sm" className="h-8 text-xs" onClick={handleSaveApiKey}>
                  确认
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setIsEditing(false)}>
                  取消
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                  {apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : '未设置'}
                </span>
                <Button size="sm" variant={apiKey ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => {
                  setApiKeyInput(apiKey)
                  setIsEditing(true)
                }}>
                  {apiKey ? '编辑' : '设置'}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full p-6">
        {error && (
          <Card className="bg-destructive/10 border-destructive/30 mb-4">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <span className="text-destructive text-sm">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="h-7 w-7 flex items-center justify-center hover:bg-destructive/20 rounded"
              >
                ×
              </button>
            </CardContent>
          </Card>
        )}
        <NamespaceList
          onSelect={handleSelectNamespace}
          onError={handleError}
        />
      </main>
    </div>
  )
}

export default App
