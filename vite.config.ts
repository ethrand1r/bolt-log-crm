import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // PDF kütüphanesi büyük ama sadece teklif PDF'i oluşturulurken yükleniyor
  build: { chunkSizeWarningLimit: 1100 },
})
