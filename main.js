export default {
  async fetch(req) {
    const TARGET_DOMAIN = Deno.env.get("TARGET_DOMAIN");

    if (!TARGET_DOMAIN) {
      return new Response("TARGET_DOMAIN not set", { status: 500 });
    }

    const url = new URL(req.url);

    const targetUrl =
      TARGET_DOMAIN.replace(/\/+$/, "") +
      url.pathname +
      url.search;

    // ساخت header ها
    const headers = new Headers(req.headers);

    // حذف hop-by-hop headers
    const remove = [
      "connection",
      "keep-alive",
      "proxy-authenticate",
      "proxy-authorization",
      "te",
      "trailer",
      "transfer-encoding",
      "upgrade"
    ];

    remove.forEach((h) => headers.delete(h));

    headers.set("host", new URL(TARGET_DOMAIN).hostname);

    try {
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: req.body,
        redirect: "manual"
      });

      const resHeaders = new Headers(upstream.headers);

      remove.forEach((h) => resHeaders.delete(h));

      resHeaders.set("x-relay", "deno-deploy-relay");

      return new Response(upstream.body, {
        status: upstream.status,
        headers: resHeaders
      });
    } catch (err) {
      return new Response("Upstream error: " + err.message, {
        status: 502
      });
    }
  }
};