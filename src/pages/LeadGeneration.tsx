import { Radar } from 'lucide-react'
import { PageHeader } from '../components/ui'

export default function LeadGeneration() {
  return (
    <>
      <PageHeader title="Lead Generation" subtitle="Yeni müşteri adaylarını bulma ve değerlendirme" />
      <div className="card flex flex-col items-center px-6 py-16 text-center">
        <Radar className="mb-3 h-10 w-10 text-brand-500" />
        <h2 className="font-semibold text-slate-800">Bu modül planlanıyor</h2>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          Lead Generation ekranının detayları ayrıca planlanacak. Şimdilik yeni adayları
          <b> Firmalar</b> bölümüne “Potansiyel Müşteri” olarak ekleyip <b>Satış Hunisi</b>’nde takip edebilirsiniz.
        </p>
      </div>
    </>
  )
}
