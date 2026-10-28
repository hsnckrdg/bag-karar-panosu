const ALLOWED_LOCATIONS = [
  { name: "Saruhanlı", latitude: 38.734, longitude: 27.568 },
  { name: "Alaşehir", latitude: 38.350, longitude: 28.517 },
  { name: "Sarıgöl", latitude: 38.239, longitude: 28.696 },
];

const CACHE_SECONDS = 30 * 60; // 30 dakika

const ALLOWED_ORIGINS = new Set([
  "https://hsnckrdg.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://bag-karar-panosu.pages.dev",
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin");

  return {
    "Access-Control-Allow-Origin":
      origin && ALLOWED_ORIGINS.has(origin)
        ? origin
        : "https://hsnckrdg.github.io",

    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function securityHeaders(request) {
  return {
    ...corsHeaders(request),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}

function jsonResponse(request, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...securityHeaders(request),
      ...extraHeaders,
    },
  });
}

function allowedLocation(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return ALLOWED_LOCATIONS.find(
    (location) =>
      Math.abs(location.latitude - lat) < 0.0005 &&
      Math.abs(location.longitude - lon) < 0.0005,
  );
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: securityHeaders(request),
      });
    }

    if (request.method !== "GET") {
      return jsonResponse(
        request,
        { error: "Sadece GET isteklerine izin veriliyor." },
        405,
      );
    }

    // Basit sağlık kontrolü
    if (url.pathname === "/") {
      return jsonResponse(request, {
        service: "Bağ Karar Panosu API",
        status: "ok",
        cache: "30 dakika",
        rateLimit: "IP başına 30 istek / 60 saniye",
        allowedDistricts: ALLOWED_LOCATIONS.map((x) => x.name),
      });
    }

    if (url.pathname !== "/api/weather") {
      return jsonResponse(request, { error: "Uç nokta bulunamadı." }, 404);
    }

    const latitude = url.searchParams.get("latitude");
    const longitude = url.searchParams.get("longitude");

    // ALLOWLIST
    const location = allowedLocation(latitude, longitude);

    if (!location) {
      return jsonResponse(
        request,
        {
          error: "Bu koordinata izin verilmiyor.",
          code: "LOCATION_NOT_ALLOWED",
        },
        403,
      );
    }

    // IP tabanlı RATE LIMIT
    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "local-development";

    const rateResult = await env.RATE_LIMITER.limit({
      key: ip,
    });

    if (!rateResult.success) {
      return jsonResponse(
        request,
        {
          error: "Çok fazla istek gönderildi.",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: 60,
        },
        429,
        {
          "Retry-After": "60",
          "X-Rate-Limit": "30 requests / 60 seconds",
        },
      );
    }

    const mode = url.searchParams.get("mode");

    let upstreamUrl;

    if (mode === "forecast") {
      upstreamUrl = new URL(
        "https://api.open-meteo.com/v1/forecast",
      );

      upstreamUrl.search = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        daily:
          "temperature_2m_max,temperature_2m_min,precipitation_sum",
        timezone: "Europe/Istanbul",
        forecast_days: "7",
      });
    } else if (mode === "archive") {
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");

      if (!validDate(startDate) || !validDate(endDate)) {
        return jsonResponse(
          request,
          {
            error:
              "Arşiv isteğinde geçerli start_date ve end_date gereklidir.",
          },
          400,
        );
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start > end) {
        return jsonResponse(
          request,
          { error: "start_date, end_date değerinden sonra olamaz." },
          400,
        );
      }

      const maximumRange =
        12 * 366 * 24 * 60 * 60 * 1000;

      if (end - start > maximumRange) {
        return jsonResponse(
          request,
          { error: "İzin verilen tarih aralığı aşıldı." },
          400,
        );
      }

      upstreamUrl = new URL(
        "https://archive-api.open-meteo.com/v1/archive",
      );

      upstreamUrl.search = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        start_date: startDate,
        end_date: endDate,
        daily: "temperature_2m_max,temperature_2m_min",
        timezone: "Europe/Istanbul",
      });
    } else {
      return jsonResponse(
        request,
        {
          error: "mode yalnızca forecast veya archive olabilir.",
        },
        400,
      );
    }

    // 30 DAKİKALIK CACHE
    const cache = caches.default;

    const cacheKey = new Request(url.toString(), {
      method: "GET",
    });

    const cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      const headers = new Headers(cachedResponse.headers);

      Object.entries(securityHeaders(request)).forEach(
        ([key, value]) => headers.set(key, value),
      );

      headers.set("X-Cache", "HIT");

      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        headers,
      });
    }

    // OPEN-METEO
    let upstreamResponse;

    try {
      upstreamResponse = await fetch(upstreamUrl.toString());
    } catch {
      return jsonResponse(
        request,
        {
          error: "Open-Meteo servisine ulaşılamadı.",
          code: "UPSTREAM_CONNECTION_ERROR",
        },
        502,
      );
    }

    if (!upstreamResponse.ok) {
      return jsonResponse(
        request,
        {
          error: "Open-Meteo geçerli yanıt vermedi.",
          upstreamStatus: upstreamResponse.status,
        },
        502,
      );
    }

    const body = await upstreamResponse.text();

    // Cache'e CORS'tan bağımsız kopya koyuyoruz.
    const responseForCache = new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control":
          `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
      },
    });

    ctx.waitUntil(
      cache.put(cacheKey, responseForCache.clone()),
    );

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control":
          `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
        "X-Cache": "MISS",
        ...securityHeaders(request),
      },
    });
  },
};