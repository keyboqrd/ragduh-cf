import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface ApiKeyContextValue {
  apiKey: string;
  setApiKey: (key: string) => void;
  isLoading: boolean;
}

const ApiKeyContext = createContext<ApiKeyContextValue | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('e2e_api_key');
    if (stored) {
      setApiKeyState(stored);
    }
    setIsLoading(false);
  }, []);

  const setApiKey = (key: string) => {
    localStorage.setItem('e2e_api_key', key);
    setApiKeyState(key);
  };

  return (
    <ApiKeyContext.Provider value={{ apiKey, setApiKey, isLoading }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const context = useContext(ApiKeyContext);
  if (context === undefined) {
    throw new Error('useApiKey must be used within an ApiKeyProvider');
  }
  return context;
}
