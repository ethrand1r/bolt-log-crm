import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'missing-key')

/** Supabase sorgusunu çalıştırır, hata varsa fırlatır. */
export async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data as T
}

/** Edge Function çağırır; fonksiyonun döndürdüğü { error } mesajını olduğu gibi fırlatır. */
export async function invokeFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(name, { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const res = ctx ? await ctx.json().catch(() => null) : null
    if (res?.error) throw new Error(res.error)
    if (/not found|404/i.test(error.message)) throw new Error(`“${name}” Edge Function bulunamadı. Supabase’e yüklendiğinden emin olun.`)
    throw new Error(error.message)
  }
  if (!data || data.error) throw new Error(data?.error ?? `${name} yanıt vermedi.`)
  return data
}
