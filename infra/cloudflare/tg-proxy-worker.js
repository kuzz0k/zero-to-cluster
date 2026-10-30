// Cloudflare Worker: reverse proxy to api.telegram.org for Alertmanager,
// because the cluster network can't reach Telegram directly.
// Only our bot and only the methods Alertmanager (and a manual check) need are forwarded.
const BOT_ID = "9272750524";
const ALLOWED = new RegExp(`^/bot${BOT_ID}:[A-Za-z0-9_-]+/(sendMessage|getMe)$`);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!ALLOWED.test(url.pathname)) {
      return new Response("forbidden", { status: 403 });
    }
    url.hostname = "api.telegram.org";
    return fetch(new Request(url, request));
  },
};
