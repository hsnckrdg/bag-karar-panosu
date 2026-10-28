const LOCATIONS = [
    { name: "Saruhanlı", latitude: 38.734, longitude: 27.568 },
    { name: "Alaşehir", latitude: 38.350, longitude: 28.517 },
    { name: "Sarıgöl", latitude: 38.239, longitude: 28.696 }
  ];
  const BASE_TEMP = 10;
  const API_BASE = "https://bag-karar-api.hsnckrdg.workers.dev";
  let records = [];
  let weatherChart = null;
  let gddChart = null;
  let sortKey = "name";
  let sortAsc = true;
  const CACHE_KEY = "bagKararPanosu:lastSuccessfulData:v1";
  const CACHE_TIME_KEY = "bagKararPanosu:lastSuccessfulTime:v1";

  const $ = (id) => document.getElementById(id);
  const fmt = (n, digits = 1) => Number.isFinite(n) ? n.toLocaleString("tr-TR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };
const archiveCutoffDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d;
};

const archiveCutoffISO = () => {
  const d = archiveCutoffDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
  function gddForDays(maxTemps, minTemps) {
    return maxTemps.reduce((sum, t, i) => {
      const min = minTemps[i];
      if (t == null || min == null) return sum;
      return sum + Math.max(0, ((Number(t) + Number(min)) / 2) - BASE_TEMP);
    }, 0);
  }
  function setMessage(text, kind = "") {
    $("message").textContent = text;
    $("message").className = "status" + (kind ? " " + kind : "");
  }
  async function getJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("API yanıtı: " + response.status);
    return response.json();
  }

  function saveLastSuccessfulData(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIME_KEY, new Date().toISOString());
    } catch (err) {
      console.warn("Son başarılı veri kaydedilemedi:", err);
    }
  }

  function loadLastSuccessfulData() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return Array.isArray(data) && data.length ? data : null;
    } catch {
      return null;
    }
  }

  function getLastSuccessfulTime() {
    try {
      const raw = localStorage.getItem(CACHE_TIME_KEY);
      if (!raw) return null;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  async function loadLocation(loc) {
    const forecastUrl = new URL(API_BASE + "/api/weather");
    forecastUrl.search = new URLSearchParams({
      mode: "forecast",
      latitude: loc.latitude,
      longitude: loc.longitude
    });

    const archiveUrl = new URL(API_BASE + "/api/weather");
    archiveUrl.search = new URLSearchParams({
      mode: "archive",
      latitude: loc.latitude,
      longitude: loc.longitude,
      start_date: `${new Date().getFullYear()-10}-01-01`,
      end_date: archiveCutoffISO()
    });

    const [forecast, archive] = await Promise.all([
      getJson(forecastUrl),
      getJson(archiveUrl)
    ]);
    const f = forecast.daily;
    const today = todayISO();
    const todayIndex = f.time.indexOf(today);
    const currentMax = todayIndex >= 0 ? f.temperature_2m_max[todayIndex] : f.temperature_2m_max[0];
    const currentMin = todayIndex >= 0 ? f.temperature_2m_min[todayIndex] : f.temperature_2m_min[0];
    const currentRain = todayIndex >= 0 ? f.precipitation_sum[todayIndex] : f.precipitation_sum[0];

    const years = {};
    const currentYear = new Date().getFullYear();
    const dayOfYear = Math.floor((Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) - Date.UTC(currentYear,0,1)) / 86400000);
    archive.daily.time.forEach((date, i) => {
      const year = Number(date.slice(0,4));
      const doy = Math.floor((Date.UTC(year, Number(date.slice(5,7))-1, Number(date.slice(8,10))) - Date.UTC(year,0,1)) / 86400000);
      if (!years[year]) years[year] = { gdd: 0, count: 0 };
      if (doy <= dayOfYear && archive.daily.temperature_2m_max[i] != null && archive.daily.temperature_2m_min[i] != null) {
        years[year].gdd += Math.max(0, ((archive.daily.temperature_2m_max[i] + archive.daily.temperature_2m_min[i]) / 2) - BASE_TEMP);
        years[year].count++;
      }
    });
    const historicalYears = Object.keys(years).map(Number).filter(y => y < currentYear && years[y].count > 0).sort((a,b) => b-a).slice(0,10).sort((a,b) => a-b);
    const historicalValues = historicalYears.map(y => years[y].gdd);
    const historicalAverage = historicalValues.length ? historicalValues.reduce((a,b)=>a+b,0)/historicalValues.length : null;
    return {
      ...loc, dates: f.time, maxTemps: f.temperature_2m_max, minTemps: f.temperature_2m_min, rain: f.precipitation_sum,
      currentMax, currentMin, currentRain,
      seasonGdd: years[currentYear]?.gdd ?? null,
      historicalYears, historicalValues, historicalAverage
    };
  }
  function selectedRecords() {
    const selected = $("district").value;
    return records.filter(r => selected === "all" || r.name === selected);
  }
  function renderKpis(data) {
    const tempValues = data.filter(r => Number.isFinite(r.currentMax) && Number.isFinite(r.currentMin))
      .map(r => (r.currentMax + r.currentMin) / 2);
    const rainValues = data.map(r => r.currentRain).filter(Number.isFinite);
    const gddValues = data.map(r => r.seasonGdd).filter(Number.isFinite);
    $("kpiTemp").textContent = tempValues.length ? `${fmt(tempValues.reduce((a,b)=>a+b,0)/tempValues.length)} °C` : "—";
    $("kpiRain").textContent = rainValues.length ? `${fmt(Math.max(...rainValues))} mm` : "—";
    $("kpiGdd").textContent = gddValues.length ? `${fmt(gddValues.reduce((a,b)=>a+b,0)/gddValues.length,0)} °C·gün` : "—";
  }
  function renderAlerts(data) {
    const frost = Number($("frostThreshold").value);
    const rain = Number($("rainThreshold").value);
    const items = [];
    data.forEach(r => {
      if (Number.isFinite(r.currentMin) && r.currentMin <= frost)
        items.push(`<p><span class="tag bad">Don riski</span> <strong>${r.name}:</strong> tahmini en düşük sıcaklık ${fmt(r.currentMin)} °C (eşik: ${fmt(frost)} °C).</p>`);
      if (Number.isFinite(r.currentRain) && r.currentRain >= rain)
        items.push(`<p><span class="tag warn">Yoğun yağış</span> <strong>${r.name}:</strong> günlük yağış ${fmt(r.currentRain)} mm (eşik: ${fmt(rain)} mm).</p>`);
    });
    $("alerts").innerHTML = items.length ? items.join("") : '<p><span class="tag good">Eşik aşımı yok</span> Seçili alan için bugün belirlediğiniz don veya yoğun yağış eşikleri aşılmıyor. Tahminler değişebilir.</p>';
  }
  function renderCharts(data) {
    const labels = data[0]?.dates ?? [];
    const maxAvg = labels.map((_,i) => {
      const vals = data.map(r => r.maxTemps[i]).filter(Number.isFinite);
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    });
    const minAvg = labels.map((_,i) => {
      const vals = data.map(r => r.minTemps[i]).filter(Number.isFinite);
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    });
    const rainMax = labels.map((_,i) => Math.max(0,...data.map(r => Number(r.rain[i] ?? 0))));
    if (weatherChart) weatherChart.destroy();
    weatherChart = new Chart($("weatherChart"), {
      type: "line",
      data: { labels, datasets: [
        { label: "Ortalama en yüksek (°C)", data: maxAvg, borderColor: "#286044", backgroundColor: "#286044", yAxisID: "y", tension: .25 },
        { label: "Ortalama en düşük (°C)", data: minAvg, borderColor: "#b56a00", backgroundColor: "#b56a00", yAxisID: "y", tension: .25 },
        { label: "En yüksek yağış (mm)", data: rainMax, type: "bar", backgroundColor: "rgba(56,112,170,.45)", borderColor: "#245d91", yAxisID: "y1" }
      ]},
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        scales: { y: { title: { display: true, text: "Sıcaklık (°C)" } }, y1: { position: "right", title: { display: true, text: "Yağış (mm)" }, grid: { drawOnChartArea: false }, beginAtZero: true } },
        plugins: { legend: { labels: { font: { size: 14 } } } } }
    });
    const maxTemp = Math.max(...maxAvg.filter(Number.isFinite));
    const wetDay = labels[rainMax.indexOf(Math.max(...rainMax))];
    $("weatherSummary").textContent = `Seçili alan için tahmini en yüksek sıcaklık ${fmt(maxTemp)} °C; en yüksek yağışın beklendiği gün ${wetDay ?? "belirlenemedi"}. Grafikteki çizgiler sıcaklığı, sütunlar yağışı gösterir.`;

    // Her seçili ilçe için aynı takvim dönemindeki yıllık GDD değerlerini birleştir.
    // Böylece tek ilçe seçildiğinde başka ilçenin tarihsel verisi kullanılmaz.
    const historicalYears = [...new Set(data.flatMap(r => r.historicalYears || []))]
      .filter(year => year < new Date().getFullYear())
      .sort((a, b) => a - b)
      .slice(-10);
    const historicalSeries = historicalYears.map(year => {
      const values = data
        .filter(r => (r.historicalYears || []).includes(year))
        .map(r => r.historicalValues[(r.historicalYears || []).indexOf(year)])
        .filter(Number.isFinite);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    });
    const validHistorical = historicalSeries.filter(Number.isFinite);
    const historicalAverage = validHistorical.length
      ? validHistorical.reduce((sum, value) => sum + value, 0) / validHistorical.length
      : null;
    const historicalMin = validHistorical.length ? Math.min(...validHistorical) : null;
    const historicalMax = validHistorical.length ? Math.max(...validHistorical) : null;
    const currentValues = data.map(r => r.seasonGdd).filter(Number.isFinite);
    const currentAverage = currentValues.length
      ? currentValues.reduce((sum, value) => sum + value, 0) / currentValues.length
      : null;

    const gddLabels = historicalYears.map(String);
    gddLabels.push(String(new Date().getFullYear()) + " (bu sezon)");
    const gddValues = [...historicalSeries, currentAverage];
    const avgLine = gddLabels.map(() => historicalAverage);
    const rangeLow = gddLabels.map((_, i) => i < historicalYears.length ? historicalMin : null);
    const rangeHigh = gddLabels.map((_, i) => i < historicalYears.length ? historicalMax : null);

    if (gddChart) gddChart.destroy();
    gddChart = new Chart($("gddChart"), {
      type: "bar",
      data: {
        labels: gddLabels,
        datasets: [
          {
            type: "line", label: "10 yıllık değişim aralığı (alt sınır)",
            data: rangeLow, borderColor: "rgba(40,96,68,0)", pointRadius: 0,
            borderWidth: 0, fill: false
          },
          {
            type: "line", label: "10 yıllık değişim aralığı (üst sınır)",
            data: rangeHigh, borderColor: "rgba(40,96,68,0)", pointRadius: 0,
            borderWidth: 0, backgroundColor: "rgba(40,96,68,.14)", fill: "-1"
          },
          {
            type: "bar", label: "Yıllık GDD (°C·gün)", data: gddValues,
            backgroundColor: gddLabels.map((_, i) => i === gddLabels.length - 1 ? "#b56a00" : "#6e9876")
          },
          {
            type: "line", label: "Son 10 yıl ortalaması",
            data: avgLine, borderColor: "#183d2b", borderWidth: 3,
            borderDash: [7, 5], pointRadius: 0, fill: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Birikimli GDD (°C·gün)" } }
        },
        plugins: { legend: { display: false } }
      }
    });
    $("gddSummary").textContent = currentAverage != null && historicalAverage != null
      ? `Bu sezon: ${fmt(currentAverage, 0)} °C·gün. Son 10 yıl ortalaması: ${fmt(historicalAverage, 0)} °C·gün. Geçmiş yılların aynı dönem GDD aralığı: ${fmt(historicalMin, 0)}–${fmt(historicalMax, 0)} °C·gün. ${data.length > 1 ? "Değerler seçili ilçelerin ortalamasıdır." : "Değer seçili ilçeye aittir."}`
      : "GDD karşılaştırması için yeterli tarihsel veri alınamadı.";
  }
  function renderForecastTable(data) {
    const dates = data[0]?.dates ?? [];
    let html = '<table><thead><tr><th>Tarih</th><th>En yüksek sıcaklık (°C)</th><th>En düşük sıcaklık (°C)</th><th>Yağış (mm)</th></tr></thead><tbody>';
    dates.forEach((date,i) => {
      const max = data.map(r=>r.maxTemps[i]).filter(Number.isFinite);
      const min = data.map(r=>r.minTemps[i]).filter(Number.isFinite);
      const rain = data.map(r=>r.rain[i]).filter(Number.isFinite);
      html += `<tr><td>${date}</td><td>${max.length?fmt(max.reduce((a,b)=>a+b,0)/max.length):"—"}</td><td>${min.length?fmt(min.reduce((a,b)=>a+b,0)/min.length):"—"}</td><td>${rain.length?fmt(Math.max(...rain)):"—"}</td></tr>`;
    });
    $("forecastTable").innerHTML = html + "</tbody></table>";
  }
  function renderDetails(data) {
    const sorted = [...data].sort((a,b) => {
      const av = a[sortKey], bv = b[sortKey];
      const result = typeof av === "string" ? av.localeCompare(bv, "tr") : (Number(av ?? -Infinity) - Number(bv ?? -Infinity));
      return sortAsc ? result : -result;
    });
    const columns = [
      ["name","İlçe"], ["currentMax","En yüksek (°C)"], ["currentMin","En düşük (°C)"],
      ["currentRain","Yağış (mm)"], ["seasonGdd","Sezon GDD"], ["historicalAverage","10 yıl ort. GDD"]
    ];
    let html = "<table><thead><tr>";
    columns.forEach(([key,label]) => html += `<th><button type="button" data-sort="${key}" aria-label="${label} sütununa göre sırala">${label} ↕</button></th>`);
    html += "</tr></thead><tbody>";
    sorted.forEach(r => {
      html += `<tr><td>${r.name}</td><td>${fmt(r.currentMax)}</td><td>${fmt(r.currentMin)}</td><td>${fmt(r.currentRain)}</td><td>${fmt(r.seasonGdd,0)}</td><td>${fmt(r.historicalAverage,0)}</td></tr>`;
    });
    $("detailsTable").innerHTML = html + "</tbody></table>";
    $("detailsTable").querySelectorAll("[data-sort]").forEach(btn => btn.addEventListener("click", () => {
      const next = btn.dataset.sort;
      if (sortKey === next) sortAsc = !sortAsc; else { sortKey = next; sortAsc = true; }
      renderDetails(selectedRecords());
    }));
  }
  function renderEmptyState() {
    $("kpiTemp").textContent = "—";
    $("kpiRain").textContent = "—";
    $("kpiGdd").textContent = "—";
    $("alerts").innerHTML = '<div class="empty-state">Seçili alan için gösterilecek veri bulunamadı.</div>';
    $("weatherSummary").textContent = "Hava tahmini verisi bulunamadı.";
    $("gddSummary").textContent = "GDD karşılaştırması için veri bulunamadı.";
    $("forecastTable").innerHTML = '<div class="empty-state">Tahmin tablosu için veri bulunamadı.</div>';
    $("detailsTable").innerHTML = '<div class="empty-state">İlçe detayları için veri bulunamadı.</div>';

    if (weatherChart) { weatherChart.destroy(); weatherChart = null; }
    if (gddChart) { gddChart.destroy(); gddChart = null; }

    setMessage("Seçili alan için gösterilecek veri bulunamadı. Farklı bir ilçe seçin veya verileri yeniden yükleyin.", "warning");
  }

  function render() {
    const data = selectedRecords();
    if (!data.length) {
      renderEmptyState();
      return;
    }
    renderKpis(data);
    renderAlerts(data);
    renderCharts(data);
    renderForecastTable(data);
    renderDetails(data);
  }
  async function refresh() {
    $("refreshBtn").disabled = true;
    $("connectionStatus").textContent = "Veri yükleniyor";
    setMessage("Open-Meteo'dan güncel tahmin ve tarihsel veriler alınıyor…");

    try {
      const results = await Promise.all(LOCATIONS.map(loadLocation));
      records = results;

      const updatedAt = new Date();
      saveLastSuccessfulData(results);

      render();
      $("lastUpdated").textContent = updatedAt.toLocaleString("tr-TR");
      $("connectionStatus").textContent = "Canlı veri";
      setMessage("Veriler başarıyla güncellendi. Tahminler değişebilir; karar öncesi güncel yerel koşulları kontrol edin.");
    } catch (err) {
      const cached = loadLastSuccessfulData();
      const cachedAt = getLastSuccessfulTime();

      if (cached) {
        records = cached;
        render();
        $("connectionStatus").textContent = "Kayıtlı veri";
        $("lastUpdated").textContent = cachedAt
          ? cachedAt.toLocaleString("tr-TR") + " (son başarılı veri)"
          : "son başarılı veri";

        setMessage(
          "Open-Meteo'ya şu anda ulaşılamıyor. Ekranda tarayıcıya kaydedilmiş son başarılı veriler gösteriliyor." +
          (cachedAt ? " Bu veriler " + cachedAt.toLocaleString("tr-TR") + " tarihinde alınmıştı." : "") +
          " Güncel karar vermeden önce bağlantı yeniden sağlandığında verileri yenileyin.",
          "warning"
        );
      } else if (records.length) {
        render();
        $("connectionStatus").textContent = "Oturumdaki veri";
        setMessage("Yeni veri alınamadı; ekranda bu oturumda alınmış son başarılı veriler gösteriliyor.", "warning");
      } else {
        $("connectionStatus").textContent = "Bağlantı hatası";
        setMessage(
          "API verisi alınamadı ve daha önce kaydedilmiş başarılı veri bulunamadı. İnternet bağlantısını kontrol edip yeniden deneyin. Hata: " + err.message,
          "error"
        );
      }
    } finally {
      $("refreshBtn").disabled = false;
    }
  }
  $("district").addEventListener("change", render);
  $("frostThreshold").addEventListener("change", render);
  $("rainThreshold").addEventListener("change", render);
  $("refreshBtn").addEventListener("click", refresh);
  refresh();
