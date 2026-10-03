import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Modal } from './ui'

/** Hazır e-posta şablonu: sağ üstteki "Kopyala" ile biçimli metin panoya kopyalanır. */
export function MailTemplateModal({ subject, html, text, onClose }: { subject: string; html: string; text: string; onClose: () => void }) {
  const [copied, setCopied] = useState<'body' | 'subject' | null>(null)

  async function copyBody() {
    try {
      // Biçimli (HTML) + düz metin birlikte: Outlook/Gmail tabloları korur
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ])
    } catch {
      await navigator.clipboard.writeText(text)
    }
    flash('body')
  }

  async function copySubject() {
    await navigator.clipboard.writeText(subject)
    flash('subject')
  }

  function flash(k: 'body' | 'subject') {
    setCopied(k)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <Modal open wide title="E-posta şablonu" onClose={onClose} actions={
      <button className="btn-primary" onClick={copyBody}>
        {copied === 'body' ? <><Check className="h-4 w-4" /> Kopyalandı</> : <><Copy className="h-4 w-4" /> Kopyala</>}
      </button>
    }>
      <div className="mb-3 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">Konu:</span>
        <span className="flex-1 font-medium">{subject}</span>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={copySubject}>
          {copied === 'subject' ? <><Check className="h-3.5 w-3.5" /> Kopyalandı</> : <><Copy className="h-3.5 w-3.5" /> Konuyu kopyala</>}
        </button>
      </div>
      {/* E-postada nasıl görüneceği: karanlık modda da beyaz zemin */}
      <div className="max-h-[60vh] overflow-y-auto rounded-md border border-slate-200 bg-[#fff] p-4" dangerouslySetInnerHTML={{ __html: html }} />
      <p className="mt-2 text-xs text-slate-400">“Kopyala”ya basıp e-posta gövdesine yapıştırın (Ctrl+V). Tablolar biçimiyle birlikte aktarılır.</p>
    </Modal>
  )
}
