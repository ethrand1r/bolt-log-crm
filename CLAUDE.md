# BOLT LOG CRM

## İş
BOLT LOG yeni kurulmuş bir freight forwarder (uluslararası taşıma organizatörü) şirketi. Ağırlık **deniz (FCL/LCL)** ve **hava** kargoda. Müşteriler ihracatçı/ithalatçı firmalar. Şirket, armatörler, havayolları ve yurt dışı acentelerle çalışarak taşımayı organize ediyor.

## Projenin amacı
Şirketin kendi iç CRM'i. Müşteri kazanımından sevkiyatın teslimine kadar olan süreci tek yerde yönetmek:
lead bulma → müşteri/kontak takibi → satış hunisi → teklif (TR/EN PDF) → sevkiyat dosyası → karlılık.

Şimdilik tek kullanıcı (şirket sahibi). İleride satış/operasyon ekibi eklenecek.

## Kapsam
- **Faz 1 (MVP):** Lead Generation ekranı (detayları ayrıca planlanacak), Firmalar & Kişiler, Satış Hunisi, Teklif + PDF, Sevkiyat Dosyaları, Dashboard, Ayarlar
- **Faz 2:** Navlun (rate) tablosu, görevler/hatırlatıcılar, raporlar, çoklu kullanıcı & roller
- **Faz 3:** E-posta entegrasyonu, konteyner/AWB takip API'leri, müşteri portalı, muhasebe entegrasyonu

## Teknik
- Vite + React + TypeScript + Tailwind; statik build alınıp şirketin kendi hosting'ine yüklenecek (Node sunucusu yok)
- Backend: Supabase (PostgreSQL, Auth, Storage)
- Arayüz Türkçe; teklif PDF'leri Türkçe/İngilizce seçmeli

## Sektör terimleri
FCL/LCL, TEU, POL/POD, ETD/ETA, Incoterms, MBL/HBL (deniz konşimentosu), MAWB/HAWB (hava konşimentosu), chargeable weight (hava: 1 CBM = 167 kg), shipper/consignee/notify party.
