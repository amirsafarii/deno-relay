// main.js
// Deno Deploy HTTP relay using TARGET_DOMAIN
// TARGET_DOMAIN را در پنل Deno Deploy > Settings > Environment Variables تنظیم کنید
// مثال: https://example.com:443

const RAW_TARGET = Deno.env.get("TARGET_DOMAIN") || "";

if (!RAW_TARGET) {
  console.warn("⚠️ TARGET_DOMAIN is not set");
}

// حذف اسلش‌های انتهایی برای جلوگیری از URL نادرست
const TARGET_DOMAIN = RAW_TARGET.replace(/\/+$/, "");

// هدرهای Hop-by-hop که نباید فوروارد شوند (طبق RFC 2616)
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

/**
 * استخراج path + query از URL ورودی
 * مثال: https://relay.com/api/users?id=1 → /api/users?id=1
 */
function getPathAndQuery(url) {
  const slashIndex = url.indexOf("/", 8); // شروع بعد از "https://"
  return slashIndex === -1 ? "/" : url.slice(slashIndex);
}

/**
 * ساخت URL نهایی برای درخواست به سرور مقصد
 */
function buildTargetUrl(reqUrl) {
  const pathAndQuery = getPathAndQuery(reqUrl);
  return TARGET_DOMAIN + pathAndQuery;
}

/**
 * فیلتر و تبدیل هدرهای درخواست ورودی
 * - حذف هدرهای hop-by-hop
 * - حذف هدرهای خاص Vercel
 * - مدیریت صحیح X-Forwarded-For برای حفظ IP واقعی کلاینت
 */
function makeRequestHeaders(req) {  const headers = new Headers();

  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (lower.startsWith("x-vercel-")) continue; // هدرهای خاص Vercel
    if (lower === "host") continue;
    if (lower === "x-forwarded-host") continue;
    if (lower === "x-forwarded-proto") continue;
    if (lower === "x-forwarded-port") continue;

    headers.set(key, value);
  }

  // حفظ IP واقعی کلاینت
  const realIp =
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for");

  if (realIp) {
    headers.set("x-forwarded-for", realIp);
  }

  return headers;
}

/**
 * فیلتر هدرهای پاسخ سرور مقصد قبل از بازگشت به کلاینت
 */
function makeResponseHeaders(upstreamHeaders) {
  const headers = new Headers();

  for (const [key, value] of upstreamHeaders.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    headers.set(key, value);
  }

  // هدر شناسایی برای دیباگ
  headers.set("x-relay", "deno-target-domain-relay");
  return headers;
}

/**
 * ساخت پاسخ خطا با فرمت JSON یکپارچه
 */
function errorResponse(message, status = 500) {
  return new Response(
    JSON.stringify({ ok: false, error: message }, null, 2),    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}

/**
 * هندلر اصلی Deno Deploy
 * ورودی: Request
 * خروجی: Promise<Response>
 */
export default async function handler(req) {
  // بررسی وجود متغیر محیطی
  if (!TARGET_DOMAIN) {
    return errorResponse("TARGET_DOMAIN environment variable is missing", 500);
  }

  // ساخت و اعتبارسنجی URL مقصد
  let targetUrl;
  try {
    targetUrl = buildTargetUrl(req.url);
    new URL(targetUrl); // اعتبارسنجی ساختار URL
  } catch {
    return errorResponse("Invalid TARGET_DOMAIN or request URL", 500);
  }

  const method = req.method.toUpperCase();

  // آماده‌سازی گزینه‌های fetch
  const options = {
    method,
    headers: makeRequestHeaders(req),
    redirect: "manual" // جلوگیری از ریدایرکت خودکار
  };

  // افزودن body برای متدهای غیر از GET/HEAD
  if (method !== "GET" && method !== "HEAD") {
    options.body = req.body;
    // نیاز برای استریم کردن body در Deno
    options.duplex = "half";
  }

  try {
    // ارسال درخواست به سرور مقصد
    const upstream = await fetch(targetUrl, options);
    // بازگرداندن پاسخ با هدرهای فیلترشده
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: makeResponseHeaders(upstream.headers)
    });
  } catch (err) {
    // مدیریت خطاهای شبکه
    return errorResponse(
      "Could not reach TARGET_DOMAIN: " + (err?.message || "unknown error"),
      502
    );
  }
}