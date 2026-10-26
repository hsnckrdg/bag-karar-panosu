Bağ Karar Panosu

Manisa'daki üzüm üreticileri (kurgusal kooperatif) için, sabah bağa çıkmadan 1 dakikada ilaçlama/sulama kararı vermeyi sağlayan hava ve büyüme derece-günü (GDD) panosu.

Canlı link: [https://hsnckrdg.github.io/bag-karar-panosu/]
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
