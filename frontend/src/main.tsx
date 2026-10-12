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
  return (
    <FinancialProfileProvider>
      <RetirementPlanProvider>
        {children}
      </RetirementPlanProvider>
    </FinancialProfileProvider>
  );
}

// Vô hiệu hóa toàn bộ tính năng vuốt/cuộn chuột làm tăng giảm giá tiền hoặc số liệu trên các ô input
if (typeof window !== "undefined") {
  window.addEventListener(
    "wheel",
    (event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        (target.type === "number" || target.inputMode === "numeric" || target.getAttribute("inputmode") === "numeric")
      ) {
        target.blur();
      }
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement &&
        (active.type === "number" || active.inputMode === "numeric" || active.getAttribute("inputmode") === "numeric")
      ) {
        active.blur();
      }
    },
    { passive: true }
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
