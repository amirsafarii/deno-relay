// main.js
// Deno Deploy HTTP relay using TARGET_DOMAIN
// TARGET_DOMAIN را در پنل Deno Deploy > Settings > Environment Variables تنظیم کنید
// مثال: https://example.com:443

const RAW_TARGET = Deno.env.get("TARGET_DOMAIN") || "";

if (!RAW_TARGET) {
  console.warn("⚠️ TARGET_DOMAIN is not set");
}

const TARGET_DOMAIN = RAW_TARGET.replace(/\/+$/, "");

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function getPathAndQuery(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    const slashIndex = url.indexOf("/", 8);
    return slashIndex === -1 ? "/" : url.slice(slashIndex);
  }
}

function buildTargetUrl(reqUrl) {
  const pathAndQuery = getPathAndQuery(reqUrl);
  return TARGET_DOMAIN + pathAndQuery;
}

function makeRequestHeaders(req) {
  const headers = new Headers();

  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (lower.startsWith("x-vercel-")) continue;
    if (lower === "host") continue;
    if (lower === "x-forwarded-host") continue;
    if (lower === "x-forwarded-proto") continue;
    if (lower === "x-forwarded-port") continue;    headers.set(key, value);
  }

  const realIp = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for");
  if (realIp) {
    headers.set("x-forwarded-for", realIp);
  }

  return headers;
}

function makeResponseHeaders(upstreamHeaders) {
  const headers = new Headers();
  for (const [key, value] of upstreamHeaders.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    headers.set(key, value);
  }
  headers.set("x-relay", "deno-target-domain-relay");
  return headers;
}

function errorResponse(message, status = 500) {
  return new Response(
    JSON.stringify({ ok: false, error: message }, null, 2),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}

// ✅ الگوی صحیح برای Deno Deploy: export default { fetch: ... }
export default {
  async fetch(req) {
    // هلت چک ساده برای تست سلامت سرویس
    if (req.method === "GET" && new URL(req.url).pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", target: TARGET_DOMAIN || "not-set" }),
        { headers: { "content-type": "application/json" } }
      );
    }

    if (!TARGET_DOMAIN) {
      return errorResponse("TARGET_DOMAIN environment variable is missing", 500);
    }
    let targetUrl;
    try {
      targetUrl = buildTargetUrl(req.url);
      new URL(targetUrl);
    } catch {
      return errorResponse("Invalid TARGET_DOMAIN or request URL", 500);
    }

    const method = req.method.toUpperCase();
    const options = {
      method,
      headers: makeRequestHeaders(req),
      redirect: "manual"
    };

    // فقط برای متدهایی که body دارند، body را اضافه می‌کنیم
    // در Deno Deploy نیازی به duplex: "half" نیست
    if (!["GET", "HEAD"].includes(method)) {
      options.body = req.body;
    }

    try {
      const upstream = await fetch(targetUrl, options);
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: makeResponseHeaders(upstream.headers)
      });
    } catch (err) {
      console.error("Relay error:", err?.message || err);
      return errorResponse(
        "Could not reach TARGET_DOMAIN: " + (err?.message || "unknown error"),
        502
      );
    }
  }
};