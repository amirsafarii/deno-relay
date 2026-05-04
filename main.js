const TARGET_DOMAIN = Deno.env.get("TARGET_DOMAIN") || "";

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

function makeRequestHeaders(req) {
  const headers = new Headers(req.headers);

  for (const key of headers.keys()) {
    const lower = key.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(lower)) headers.delete(key);
    if (lower.startsWith("x-forwarded")) headers.delete(key);
  }

  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for");
  if (ip) headers.set("x-forwarded-for", ip);

  return headers;
}

function makeResponseHeaders(headers) {
  const out = new Headers();

  for (const [k, v] of headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(k.toLowerCase())) {
      out.set(k, v);
    }
  }

  out.set("x-relay", "deno-relay");
  return out;
}

export default async function handler(req) {
  if (!TARGET_DOMAIN) {
    return new Response("TARGET_DOMAIN missing", { status: 500 });
  }

  const url = new URL(req.url);

  const targetUrl = TARGET_DOMAIN + url.pathname + url.search;

  const options = {
    method: req.method,
    headers: makeRequestHeaders(req),
    redirect: "manual"
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    options.body = req.body;
  }

  try {
    const upstream = await fetch(targetUrl, options);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: makeResponseHeaders(upstream.headers)
    });
  } catch (e) {
    return new Response("relay error: " + e.message, { status: 502 });
  }
}