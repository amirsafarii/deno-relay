// main.js - تست مینیمال برای Deno Deploy
export default {
  async fetch(req) {
    const url = new URL(req.url);
    
    // اندپوینت سلامت
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({ 
          status: "ok", 
          target: Deno.env.get("TARGET_DOMAIN") || "not-set",
          url: req.url 
        }),
        { 
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }
    
    // رله ساده: فقط لاگ می‌زند و پاسخ ثابت می‌دهد
    console.log(`→ ${req.method} ${url.pathname}`);
    
    return new Response(
      JSON.stringify({ 
        message: "Relay is working!",
        method: req.method,
        path: url.pathname
      }),
      { 
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  }
};