# BOLT LOG CRM

## 1. Supabase kurulumu (bir kerelik)

1. https://supabase.com adresinde ücretsiz hesap açın ve **New project** ile bir proje oluşturun (bölge: Frankfurt önerilir).
2. Sol menüden **SQL Editor > New query** açın ve şu dosyaları **sırayla**, her birini ayrı sorgu olarak yapıştırıp **Run** deyin:
   1. `supabase/schema.sql`: temel tablolar
   2. `supabase/002_update.sql`: sektörler, çoklu telefon/e-posta, EORI, karayolu, ölçüler, fatura durumları
   3. `supabase/003_update.sql`: teklif numarası (SEA/AIR/ROAD), LDM, hava aktarma noktaları, İngilizce ülke adları
   4. `supabase/demo_data.sql`: (isteğe bağlı) 10 örnek firma + 20 örnek fırsat.
      Silmek için: `delete from companies where 'demo' = any(tags);`
3. **Authentication > Users > Add user > Create new user** ile kendi e-posta ve şifrenizi oluşturun ("Auto confirm user" işaretli olsun).
4. **Authentication > Sign In / Providers** altında **"Allow new users to sign up"** seçeneğini **kapatın**.
   Bu önemli: kapatılmazsa başkaları kendi hesabını açıp verilere erişebilir.
5. **Project Settings > API** sayfasından `Project URL` ve `anon public` anahtarını kopyalayın.

## 2. Bilgisayarda çalıştırma

Proje klasöründe `.env` dosyası oluşturun (`.env.example` örneğine bakın):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
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
