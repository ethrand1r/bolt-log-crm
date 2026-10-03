// Teklif için e-postaya yapıştırılabilir şablon (HTML + düz metin)
import type { ChargeLine, ChargeTemplate, Contact, Quote, Settings } from './types'
import { T, chargeRows, date, detailRows, modeText, routeText } from './quoteText'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

export function buildQuoteMail(args: {
  quote: Quote
  items: ChargeLine[]
  contact: Contact | null
  settings: Settings
  templates: ChargeTemplate[]
}) {
  const { quote, items, contact, settings, templates } = args
  const lang = quote.language
  const t = T[lang]
  const route = routeText(quote)
  const mode = modeText(quote.mode, lang)
  const details = detailRows(quote, lang).filter(([k]) => k !== t.mode)
  const { rows, totals } = chargeRows(items, templates, lang)
  const terms = quote.terms || (lang === 'tr' ? settings.quote_terms_tr : settings.quote_terms_en)
  const greeting = contact?.full_name ? t.greeting(contact.full_name) : t.greetingDefault
  const signature = [settings.company_name, settings.phone, settings.email, settings.website].filter(Boolean) as string[]

  const subject = t.subject(quote.quote_no, route, mode)

  // --- HTML (e-posta istemcilerinde düzgün görünsün diye satır içi stiller)
  const td = 'padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;'
  const th = 'padding:6px 10px;background:#1e3a8a;color:#fff;font-size:12px;text-align:left;'
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;font-size:14px;line-height:1.5">
<p>${esc(greeting)}</p>
<p>${esc(t.intro(route, mode))}</p>
<p style="margin:16px 0 6px;font-weight:bold;color:#1e3a8a">${esc(t.details)} - ${esc(quote.quote_no)}</p>
<table style="border-collapse:collapse;min-width:420px">
${details.map(([k, v]) => `<tr><td style="${td}color:#64748b;width:180px">${esc(k)}</td><td style="${td}font-weight:bold">${esc(v)}</td></tr>`).join('\n')}
</table>
<p style="margin:16px 0 6px;font-weight:bold;color:#1e3a8a">${esc(t.charges)}</p>
<table style="border-collapse:collapse;min-width:420px">
<tr><th style="${th}">${t.desc}</th><th style="${th}">${t.unit}</th><th style="${th}text-align:right">${t.qty}</th><th style="${th}text-align:right">${t.price}</th><th style="${th}text-align:right">${t.total}</th></tr>
${rows.map((r) => `<tr><td style="${td}">${esc(r.desc)}</td><td style="${td}color:#475569">${esc(r.unit)}</td><td style="${td}text-align:right">${r.qty}</td><td style="${td}text-align:right">${r.price}</td><td style="${td}text-align:right;font-weight:bold">${r.total}</td></tr>`).join('\n')}
${totals.map((x) => `<tr><td colspan="4" style="${td}text-align:right;font-weight:bold;background:#eff6ff">${t.grand}</td><td style="${td}text-align:right;font-weight:bold;color:#1e3a8a;background:#eff6ff">${x}</td></tr>`).join('\n')}
</table>
<p style="margin-top:16px"><b>${esc(t.validLine(date(quote.valid_until, lang)))}</b></p>
${quote.notes ? `<p><b>${esc(t.notes)}:</b><br>${esc(quote.notes)}</p>` : ''}
${terms ? `<p style="font-size:12px;color:#475569"><b>${esc(t.terms)}:</b><br>${esc(terms)}</p>` : ''}
<p>${esc(t.closing)}</p>
<p>${esc(t.regards)}<br>${signature.map(esc).join('<br>')}</p>
</div>`.trim()

  // --- Düz metin
  const pad = Math.max(...details.map(([k]) => k.length), 10)
  const text = [
    greeting, '', t.intro(route, mode), '',
    `${t.details} - ${quote.quote_no}`,
    ...details.map(([k, v]) => `  ${k.padEnd(pad)} : ${v}`), '',
    t.charges,
    ...rows.map((r) => `  - ${r.desc}: ${r.qty} x ${r.price} = ${r.total}`),
    ...totals.map((x) => `  ${t.grand}: ${x}`), '',
    t.validLine(date(quote.valid_until, lang)),
    ...(quote.notes ? ['', `${t.notes}:`, quote.notes] : []),
    ...(terms ? ['', `${t.terms}:`, terms] : []),
    '', t.closing, '', t.regards, ...signature,
  ].join('\n')

  return { subject, html, text }
}
