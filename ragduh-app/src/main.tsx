import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import NamespacePage from './NamespacePage.tsx'
import { ApiKeyProvider } from './context/ApiKeyContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiKeyProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/namespace/:namespaceId" element={<NamespacePage />} />
          <Route path="/namespace/:namespaceId/jobs" element={<NamespacePage initialView="jobs" />} />
          <Route path="/namespace/:namespaceId/documents" element={<NamespacePage initialView="documents" />} />
          <Route path="/namespace/:namespaceId/chat" element={<NamespacePage initialView="chat" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ApiKeyProvider>
  </StrictMode>,
)
