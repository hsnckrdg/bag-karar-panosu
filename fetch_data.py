import datetime as dt
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

DISTRICTS = {                      # yaklaşık ilçe koordinatları
    "saruhanli": ("Saruhanlı", 38.73, 27.57),
    "alasehir":  ("Alaşehir",  38.35, 28.52),
    "sarigol":   ("Sarıgöl",   38.24, 28.69),
}
DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum"
HISTORY_START = "2016-01-01"       # son 10 yıl ortalaması için
OUT = pathlib.Path("data")
OUT.mkdir(exist_ok=True)


def get(url, params):
    q = urllib.parse.urlencode(params)
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(f"{url}?{q}", timeout=30) as r:
                return json.load(r)
        except Exception as e:     # ağ/API hatası: bekle, tekrar dene
            last = e
            print(f"  deneme {attempt + 1} başarısız: {e}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"İstek başarısız: {last}")


def main():
    today = dt.date.today()
    archive_end = (today - dt.timedelta(days=6)).isoformat()   # arşiv ~5 gün geriden gelir
    failed = []
    for slug, (name, lat, lon) in DISTRICTS.items():
        print(f"{name} çekiliyor...")
        try:
            hist = get("https://archive-api.open-meteo.com/v1/archive", {
                "latitude": lat, "longitude": lon, "daily": DAILY,
                "start_date": HISTORY_START, "end_date": archive_end,
                "timezone": "Europe/Istanbul"})
            recent = get("https://api.open-meteo.com/v1/forecast", {
                "latitude": lat, "longitude": lon, "daily": DAILY,
                "past_days": 7, "forecast_days": 7,
                "timezone": "Europe/Istanbul"})
        except Exception as e:     # hata olursa eski dosya korunur (son başarılı veri)
            print(f"  ATLANDI: {e}", file=sys.stderr)
            failed.append(slug)
            continue
        doc = {
            "district": name, "lat": lat, "lon": lon,
            "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "source": "Open-Meteo (https://open-meteo.com), CC BY 4.0",
            "history": hist["daily"],      # 2016 -> arşiv sonu
            "recent": recent["daily"],     # son 7 gün + 7 gün tahmin
        }
        (OUT / f"{slug}.json").write_text(
            json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        time.sleep(1)              # nazik ol (hız sınırı)
    if failed:
        print("Başarısız ilçeler:", failed, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
