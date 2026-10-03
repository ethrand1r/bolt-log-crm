import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import { Spinner } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import LeadGeneration from './pages/LeadGeneration'
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
import Pipeline from './pages/Pipeline'
import Quotes from './pages/Quotes'
import QuoteEdit from './pages/QuoteEdit'
import Shipments from './pages/Shipments'
import ShipmentEdit from './pages/ShipmentEdit'
import SettingsPage from './pages/Settings'
import Reports from './pages/Reports'

function NotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-lg p-6 text-sm">
        <h1 className="mb-2 text-lg font-semibold">Supabase bağlantısı yapılandırılmamış</h1>
        <p className="text-slate-600">
          Proje klasöründe <code className="rounded bg-slate-100 px-1">.env</code> dosyası oluşturup
          <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> ve
          <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code> değerlerini girin
          (örnek: <code className="rounded bg-slate-100 px-1">.env.example</code>), ardından uygulamayı yeniden başlatın.
        </p>
      </div>
    </div>
  )
}

function App() {
  const { session, loading } = useAuth()
  if (!isConfigured) return <NotConfigured />
  if (loading) return <Spinner className="min-h-screen" />
  if (!session) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="lead-generation" element={<LeadGeneration />} />
        <Route path="firmalar" element={<Companies />} />
        <Route path="firmalar/:id" element={<CompanyDetail />} />
        <Route path="huni" element={<Pipeline />} />
        <Route path="teklifler" element={<Quotes />} />
        <Route path="teklifler/:id" element={<QuoteEdit />} />
        <Route path="sevkiyatlar" element={<Shipments />} />
        <Route path="sevkiyatlar/:id" element={<ShipmentEdit />} />
        <Route path="raporlar" element={<Reports />} />
        <Route path="ayarlar" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
