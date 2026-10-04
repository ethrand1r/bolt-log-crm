import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import logoColor from '../assets/brand/logo-renkli.svg'
import logoOnDark from '../assets/brand/logo-koyu-zemin.svg'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message === 'Invalid login credentials' ? 'E-posta veya şifre hatalı.' : error.message)
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-900 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <img src={logoColor} alt="Bolt Logistics" className="mx-auto w-52 dark:hidden" />
          <img src={logoOnDark} alt="Bolt Logistics" className="mx-auto hidden w-52 dark:block" />
          <div className="mt-1 text-xs text-slate-500">CRM'e giriş yapın</div>
        </div>
        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <label className="label">E-posta</label>
        <input className="input mb-3" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label">Şifre</label>
        <input className="input mb-5" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
      </form>
    </div>
  )
}
