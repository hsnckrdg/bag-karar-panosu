Bağ Karar Panosu

Manisa'daki üzüm üreticileri (kurgusal kooperatif) için, sabah bağa çıkmadan 1 dakikada ilaçlama/sulama kararı vermeyi sağlayan hava ve büyüme derece-günü (GDD) panosu.

Canlı link: https://bag-karar-panosu.pages.dev
Veri kaynağı: Open-Meteo Forecast + Historical Weather API (anahtarsız, CC BY 4.0)
Veri hattı: GitHub Actions her gün fetch_data.py çalıştırır → data/*.json → arayüz bu dosyaları okur
Kurulum: python fetch_data.py (ek bağımlılık yok)

Kurgusal bir müşteri için ders ödevidir; gerçek bir kurumun resmî aracı değildir. Bilgilendirme amaçlıdır, tarımsal tavsiye değildir.

CV cümlesi

(proje bitince yazılacak: fiil + ne + teknoloji + ölçülebilir sonuç)

Yapay zekâ kullanım beyanı

Gemini: GitHub Actions workflow dosyasının kurgulanması, Python veri çekme scriptinin (fetch_data.py) yazılması ve README'deki Mermaid bulut mimarisi şemasının oluşturulması için kullanıldı; üretilen kodlar proje gereksinimlerine uygun olarak test edilip doğrudan entegre edildi.
### Bulut Mimari Taslağı
```mermaid
graph TD
    A[Kullanıcı] -->|İstekler| B(Serverless API Vekili)
    B -->|IP Hız Sınırı| C{Allowlist & Cache}
    C -->|Limit Aşıldı| E[429 Too Many Requests]
    C -->|İzinli| F[Open-Meteo API]

## Güvenlik ve Altyapı

Bağ Karar Panosu, Cloudflare Pages ve Cloudflare Workers üzerinde yayınlanmaktadır.

Projede uygulanan temel güvenlik kontrolleri:

- Serverless API proxy
- IP başına 30 istek / 60 saniye rate limiting
- 30 dakikalık cache
- Saruhanlı, Alaşehir ve Sarıgöl için koordinat allowlist
- CSP, HSTS ve diğer HTTP güvenlik başlıkları
- GitHub Secret Protection ve Push Protection
- Branch Protection ve güvenlik workflow'ları
- Cloudflare Workers loglama ve 5xx hata alarmı
- 1 USD bütçe/maliyet alarmı
- OWASP ZAP güvenlik taraması

### Güvenlik Sonuçları

- SecurityHeaders.com: **A+**
- MDN HTTP Observatory: **A+ (135/100)**
- Rate limit testi: **200 isteğin 169'u HTTP 429 ile engellendi**
- Yetkisiz koordinatlar: **HTTP 403**
- Cache testi: **MISS → HIT**

### Canlı Uygulama

https://bag-karar-panosu.pages.dev

### CV Cümlesi

Cloudflare Workers tabanlı güvenli API proxy, rate limiting, cache, allowlist, CSP ve güvenlik izleme mekanizmaları uyguladım.