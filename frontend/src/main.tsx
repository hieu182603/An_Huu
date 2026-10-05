import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import { AppLoadingProvider } from './components/AppLoader'
import { MotionConfig } from 'motion/react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { FinancialProfileProvider } from './context/FinancialProfileContext'
import { NotificationProvider } from './components/Notification'
import { RetirementPlanProvider } from './context/RetirementPlanContext'
import './index.css'
import './responsive.css'

function AccountProfile({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <FinancialProfileProvider key={user?.id || "guest"}>
      <RetirementPlanProvider>
        {children}
      </RetirementPlanProvider>
    </FinancialProfileProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <AppLoadingProvider>
          <AuthProvider>
            <AccountProfile>
              <NotificationProvider>
                <AppErrorBoundary><App /></AppErrorBoundary>
              </NotificationProvider>
            </AccountProfile>
          </AuthProvider>
        </AppLoadingProvider>
      </MotionConfig>
    </BrowserRouter>
  </React.StrictMode>,
)
