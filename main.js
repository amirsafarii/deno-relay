const TARGET_DOMAIN = Deno.env.get("TARGET_DOMAIN") || "";

Deno.serve(async (req) => {
  if (!TARGET_DOMAIN) {
    return new Response("TARGET_DOMAIN missing", { status: 500 });
  }

  const url = new URL(req.url);
  const target = TARGET_DOMAIN + url.pathname + url.search;

  try {
    const res = await fetch(target, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body
    });

    return new Response(res.body, {
      status: res.status,
      headers: res.headers
    });

  } catch (e) {
    return new Response("error: " + e.message, { status: 502 });
  }
});