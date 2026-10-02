import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { FinancialProfileProvider } from './context/FinancialProfileContext'
import { NotificationProvider } from './components/Notification'
import './index.css'
import './responsive.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FinancialProfileProvider>
          <NotificationProvider>
            <App />
          </NotificationProvider>
        </FinancialProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
