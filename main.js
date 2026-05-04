const TARGET_DOMAIN = Deno.env.get("TARGET_DOMAIN") || "";

const HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function buildHeaders(req) {
  const headers = new Headers(req.headers);

  for (const h of headers.keys()) {
    const l = h.toLowerCase();
    if (HOP_HEADERS.has(l)) headers.delete(h);
  }

  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for");
  if (ip) headers.set("x-forwarded-for", ip);

  return headers;
}

function cleanResponseHeaders(headers) {
  const out = new Headers();

  for (const [k, v] of headers.entries()) {
    if (!HOP_HEADERS.has(k.toLowerCase())) {
      out.set(k, v);
    }
  }

  return out;
}

Deno.serve(async (req) => {
  if (!TARGET_DOMAIN) {
    return new Response("TARGET_DOMAIN missing", { status: 500 });
  }

  const url = new URL(req.url);

  const targetUrl = TARGET_DOMAIN + url.pathname + url.search;

  try {
    const res = await fetch(targetUrl, {
      method: req.method,
      headers: buildHeaders(req),
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined
    });

    return new Response(res.body, {
      status: res.status,
      headers: cleanResponseHeaders(res.headers)
    });

  } catch (e) {
    return new Response("relay error: " + e.message, { status: 502 });
  }
});