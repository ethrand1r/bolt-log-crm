# BOLT LOG CRM

## 1. Supabase kurulumu (bir kerelik)

1. https://supabase.com adresinde ücretsiz hesap açın ve **New project** ile bir proje oluşturun (bölge: Frankfurt önerilir).
2. Sol menüden **SQL Editor > New query** açın ve şu dosyaları **sırayla**, her birini ayrı sorgu olarak yapıştırıp **Run** deyin:
   1. `supabase/schema.sql`: temel tablolar
   2. `supabase/002_update.sql`: sektörler, çoklu telefon/e-posta, EORI, karayolu, ölçüler, fatura durumları
   3. `supabase/003_update.sql`: teklif numarası (SEA/AIR/ROAD), LDM, hava aktarma noktaları, İngilizce ülke adları
   4. `supabase/004_leads.sql`: Lead Generation (lead havuzu, temas logu, otomatik puanlama, firmaya dönüştürme)
   5. `supabase/005_lead_searches.sql`: Ülke bazlı lead aramaları (ticaret verisinden sektör + bölge), dönüştürmede Müşteri + Kazanıldı
   6. `supabase/006_lead_modes.sql`: Aramaya bağlı lead'lerde muhtemel taşıma modu otomatik
   7. `supabase/007_places_discovery.sql`: Google ile otomatik firma taraması (sorgu planı, mükerrer kontrolü, aylık istek sayacı)
   8. `supabase/008_agents_research.sql`: Hedef ülkede forwarder / acente taraması, Google'dan gelen lead'ler araştırılana kadar puanlanmaz
   9. `supabase/009_lead_research.sql`: Lead'lerin Claude ile internetten otomatik araştırılması ve araştırmaya göre puanlama
   10. `supabase/010_research_events.sql`: Araştırma adımlarının kaydı (Lead Generation > Araştırma ekranında canlı izleme)
   11. `supabase/011_research_cost.sql`: Ucuzlatılmış araştırma için ölçüm (önceki sonuçla karşılaştırma, sent altı maliyet)
   12. `supabase/demo_data.sql`: (isteğe bağlı) 10 örnek firma + 20 örnek fırsat.
      Silmek için: `delete from companies where 'demo' = any(tags);`
3. **Authentication > Users > Add user > Create new user** ile kendi e-posta ve şifrenizi oluşturun ("Auto confirm user" işaretli olsun).
4. **Authentication > Sign In / Providers** altında **"Allow new users to sign up"** seçeneğini **kapatın**.
   Bu önemli: kapatılmazsa başkaları kendi hesabını açıp verilere erişebilir.
5. **Project Settings > API Keys** sayfasından `Project URL` ve **Publishable key** (`sb_publishable_…`) değerini kopyalayın.
   Eski `anon` (eyJ…) anahtar Edge Function'larda kabul edilmez. **Secret** anahtarı asla kullanmayın.
6. **Edge Function (lead araması için ticaret verisi):** **Edge Functions > Deploy a new function > Via Editor**.
   Fonksiyon adı tam olarak `trade-stats` olmalı. Editördeki örnek kodu silip `supabase/functions/trade-stats/index.ts`
   dosyasının tamamını yapıştırın ve **Deploy** deyin. Anahtar gerekmez (UN Comtrade'in ücretsiz servisi kullanılır).
7. **Edge Function (Google ile firma taraması):** aynı şekilde `places-search` adıyla `supabase/functions/places-search/index.ts` yüklenir.
   Google anahtarı için:
   1. https://console.cloud.google.com adresinde bir proje açın, faturalandırmayı (kredi kartı) bağlayın.
      Ayda 1.000 tarama isteği ücretsizdir; uygulama varsayılan olarak 900 istekte durur (Ayarlar > Lead araması).
   2. **APIs & Services > Library** altında **Places API (New)** etkinleştirin.
   3. **APIs & Services > Credentials > Create credentials > API key**. Anahtarı düzenleyip **API restrictions** altında
      sadece **Places API (New)** seçin (anahtar sadece sunucuda durur, tarayıcıya gitmez).
   4. Supabase **Edge Functions > Secrets** altına `GOOGLE_PLACES_KEY` adıyla anahtarı ekleyin.
8. **Edge Function (lead'lerin internetten araştırılması):** `lead-research` adıyla `supabase/functions/lead-research/index.ts` yüklenir.
   1. Fonksiyonun ayarlarında **Verify JWT** (JWT doğrulaması) seçeneğini **kapatın**. Bu fonksiyonu kullanıcı değil, her dakika
      çalışan zamanlayıcı çağırır; çağrı veritabanındaki gizli bir anahtarla doğrulanır.
   2. https://console.anthropic.com adresinden bir API anahtarı alın ve **Edge Functions > Secrets** altına `ANTHROPIC_API_KEY` adıyla ekleyin.
   3. Uygulamada **Lead Generation** sayfasındaki "İnternet araştırması" çubuğunda **Kur ve başlat** deyin (bir kerelik).
      Bundan sonra "Araştırılacak" lead'ler her dakika birkaç tane olmak üzere otomatik araştırılır; çubuktan durdurup devam ettirebilirsiniz.

## 2. Bilgisayarda çalıştırma

Proje klasöründe `.env` dosyası oluşturun (`.env.example` örneğine bakın):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

```
npm install
npm run dev
```

Tarayıcıda http://localhost:5173 adresini açın.

## 3. Kendi hosting'inize yükleme

```
npm run build
```

`dist` klasörünün **içindekileri** hosting'inizin web klasörüne (ör. cPanel'de `public_html` veya bir alt alan adı klasörü) yükleyin.
`dist/.htaccess` dosyası da yüklenmeli (gizli dosya olduğu için FTP programında görünmeyebilir). Apache'de sayfa yenilemelerinin çalışması için gerekli.
Nginx kullanıyorsanız: `try_files $uri /index.html;`

Supabase anahtarı build sırasında dosyalara gömülür. `.env` değişirse yeniden build alıp yükleyin.

## Referans veriler

Liman, havalimanı ve ülke/şehir listeleri `public/` altında statik dosyalardır. Sadece ilgili seçim kutusu açıldığında yüklenir.

| Dosya | Kaynak | Yenilemek için |
|---|---|---|
| `public/ref/seaports.json` (17.596 liman) | UN/LOCODE, `code-list.csv` (github.com/datasets/un-locode) | `node scripts/build-seaports.mjs code-list.csv` |
| `public/ref/airports.json` (4.030 havalimanı) | OurAirports, `airports.csv` (ourairports.com/data) | `node scripts/build-airports.mjs airports.csv` |
| `public/geo/` (250 ülke ve şehirleri, İngilizce adlar) | `country-state-city` paketi | `node scripts/build-geo.mjs` |
| Havayolu ve armatör listesi | `src/data/carriers.ts` | Elle güncellenir. Ekrandan eklenenler `carriers` tablosuna kaydedilir. |
