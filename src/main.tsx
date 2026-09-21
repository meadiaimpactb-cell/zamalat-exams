import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { I18nProvider } from "@/i18n"
import { AuthProvider } from "@/providers/auth"
import { ConfirmProvider } from "@/providers/confirm"
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <I18nProvider>
          <ConfirmProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ConfirmProvider>
        </I18nProvider>
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
