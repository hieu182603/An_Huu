import './components/icon-base.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import { AppLoadingProvider } from './components/AppLoader'
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import { AuthProvider } from './context/AuthContext'
import { NotificationProvider } from './components/Notification'
import { preloadRoute } from './services/routePreload'
import './index.css'
import './responsive.css'

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

// A hard load of a private page needs its code as well as the session: fetch
// both at once instead of starting the chunks after the session is restored.
if (/^\/(user|onboarding)(\/|$)/.test(window.location.pathname)) preloadRoute(window.location.pathname + window.location.search)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <AppLoadingProvider>
          <AuthProvider>
            <NotificationProvider>
              <AppErrorBoundary><App /></AppErrorBoundary>
            </NotificationProvider>
          </AuthProvider>
        </AppLoadingProvider>
      </MotionConfig>
      </LazyMotion>
    </BrowserRouter>
  </React.StrictMode>,
)
