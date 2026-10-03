import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, Building2, FileText, Kanban, LayoutDashboard, LogOut, Menu, Radar, Settings, Ship, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/lead-generation', label: 'Lead Generation', icon: Radar },
  { to: '/firmalar', label: 'Firmalar & Kişiler', icon: Building2 },
  { to: '/huni', label: 'Satış Hunisi', icon: Kanban },
  { to: '/teklifler', label: 'Teklifler', icon: FileText },
  { to: '/sevkiyatlar', label: 'Sevkiyat Dosyaları', icon: Ship },
  { to: '/raporlar', label: 'Raporlar', icon: BarChart3 },
  { to: '/ayarlar', label: 'Ayarlar', icon: Settings },
]

export default function Layout() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-brand-900 text-white/90 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-yellow-400 text-brand-900">
            <Zap className="h-5 w-5" fill="currentColor" />
          </div>
          <div>
            <div className="font-bold tracking-wide text-white">BOLT LOG</div>
            <div className="text-[11px] text-white/55">CRM</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${isActive ? 'bg-white/10 font-medium text-white' : 'text-white/75 hover:bg-white/5 hover:text-white'}`
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-xs">
          <div className="truncate text-white/55">{session?.user.email}</div>
          <button className="mt-2 flex items-center gap-2 text-white/75 hover:text-white" onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-3.5 w-3.5" /> Çıkış yap
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-surface px-4 py-2.5 lg:hidden">
          <button className="btn-ghost p-1.5" onClick={() => setOpen(true)} aria-label="Menü">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold">BOLT LOG CRM</span>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
