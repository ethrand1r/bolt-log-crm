import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, Building2, FileText, Kanban, LayoutDashboard, LogOut, Menu, Radar, Settings, Ship } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import logoOnDark from '../assets/brand/logo-koyu-zemin.svg'
import iconColor from '../assets/brand/ikon-renkli.svg'

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
        <div className="px-3 pt-3 pb-4">
          <img src={logoOnDark} alt="Bolt Logistics" className="h-auto w-44" />
          <div className="mt-0.5 pl-3 text-[10px] font-semibold tracking-[0.3em] text-white/45">CRM</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition ${isActive ? 'border-brand-500 bg-white/10 font-medium text-white [&>svg]:text-brand-500' : 'border-transparent text-white/75 hover:bg-white/5 hover:text-white'}`
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
          <img src={iconColor} alt="" className="h-7 w-7" />
          <span className="font-semibold">BOLT LOGISTICS CRM</span>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
