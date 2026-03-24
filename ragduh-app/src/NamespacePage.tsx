import { useState, useEffect } from 'react'
import { useParams, useNavigate, Navigate, useLocation } from 'react-router-dom'
import { IngestForm } from './components/IngestForm'
import { JobList } from './components/JobList'
import { DocumentList } from './components/DocumentList'
import { Chat } from './components/Chat'
import { getNamespace, type IngestJob } from './api/client'
import { Card, CardContent } from './components/ui/card'
import { useApiKey } from './context/ApiKeyContext'

type View = 'ingest' | 'jobs' | 'documents' | 'chat'

interface NamespacePageProps {
  initialView?: View
}

function NamespacePage({ initialView = 'ingest' }: NamespacePageProps) {
  const { namespaceId } = useParams<{ namespaceId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { apiKey, isLoading } = useApiKey()
  const [error, setError] = useState<string | null>(null)
  const [namespaceName, setNamespaceName] = useState<string | null>(null)

  // Fetch namespace name on mount
  useEffect(() => {
    if (namespaceId) {
      getNamespace(namespaceId)
        .then((ns) => setNamespaceName(ns.name))
        .catch(() => setNamespaceName(null))
    }
  }, [namespaceId])

  // Derive currentView from URL path
  const getPathView = () => {
    const path = location.pathname
    if (path.includes('/jobs')) return 'jobs'
    if (path.includes('/documents')) return 'documents'
    if (path.includes('/chat')) return 'chat'
    return 'ingest'
  }
  const currentView = getPathView()

  useEffect(() => {
    // Sync with initialView prop on mount
    if (initialView !== 'ingest' && !location.pathname.includes(initialView)) {
      navigate(`/namespace/${namespaceId}/${initialView}`, { replace: true })
    }
  }, [])

  // 等待 API key 加载完成
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">加载中...</div>
  }

  // 没有 token 时重定向到首页
  if (!apiKey) {
    return <Navigate to="/" replace />
  }

  if (!namespaceId) {
    return <Navigate to="/" replace />
  }

  const handleJobCreated = (_job: IngestJob) => {
    navigate(`/namespace/${namespaceId}/jobs`)
    setError(null)
  }

  const handleError = (error: string) => {
    setError(error)
  }

  const handleBackToNamespaces = () => {
    navigate('/')
  }

  const navigateToView = (view: View) => {
    if (view === 'ingest') {
      navigate(`/namespace/${namespaceId}`)
    } else {
      navigate(`/namespace/${namespaceId}/${view}`)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-muted/50 py-3 px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">RagDuh</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">{namespaceName}</span>
            </span>
            <button
              type="button"
              onClick={handleBackToNamespaces}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              切换
            </button>
          </div>
        </div>
      </header>

      <nav className="border-b px-6 py-2">
        <div className="flex gap-1">
          <TabButton
            label="导入"
            active={currentView === 'ingest'}
            onClick={() => navigateToView('ingest')}
          />
          <TabButton
            label="任务"
            active={currentView === 'jobs'}
            onClick={() => navigateToView('jobs')}
          />
          <TabButton
            label="文档"
            active={currentView === 'documents'}
            onClick={() => navigateToView('documents')}
          />
          <TabButton
            label="聊天"
            active={currentView === 'chat'}
            onClick={() => navigateToView('chat')}
          />
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto w-full p-6 flex flex-col gap-6">
        {error && (
          <Card className="bg-destructive/10 border-destructive/30">
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

        {currentView === 'ingest' && (
          <IngestForm
            namespaceId={namespaceId}
            onJobCreated={handleJobCreated}
            onError={handleError}
          />
        )}

        {currentView === 'jobs' && (
          <JobList
            namespaceId={namespaceId}
            onViewDocuments={() => navigateToView('documents')}
            onError={handleError}
          />
        )}

        {currentView === 'documents' && (
          <DocumentList
            namespaceId={namespaceId}
            onError={handleError}
          />
        )}

        {currentView === 'chat' && (
          <Chat
            namespaceId={namespaceId}
            onError={handleError}
          />
        )}
      </main>
    </div>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm rounded-t border-b-0 transition-colors ${
        active
          ? 'bg-background border border-b-transparent -mb-px font-medium'
          : 'bg-muted/50 border-transparent hover:bg-muted'
      }`}
    >
      {label}
    </button>
  )
}

export default NamespacePage
