import { Hono } from "hono";
import { md5 } from "hono/utils/crypto";
export { Url2PdfWorkflow } from "./workflows/url2pdf";

const POLL_RETRIES = 30;
const POLL_INTERVAL_MS = 2000;

/**
 * Validates and parses a URL string.
 * Only http and https protocols are accepted.
 */
function parseUrl(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Normalizes a URL for use as a cache key:
 * - Lowercases the hostname
 * - Strips default ports (80 for http, 443 for https)
 * - Strips trailing slash from the pathname (except root "/")
 * - Sorts query parameters alphabetically
 * - Strips URL fragment (not sent to servers)
 */
function normalizeUrl(url: URL): string {
  const host = url.hostname.toLowerCase();
  const defaultPort = url.protocol === "https:" ? "443" : "80";
  const port = url.port && url.port !== defaultPort ? `:${url.port}` : "";
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const params = [...url.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const search = qs ? `?${qs}` : "";
  return `${url.protocol}//${host}${port}${pathname}${search}`;
}

/**
 * Escapes HTML special characters for safe embedding in HTML content.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds a self-contained HTML page that polls the server until the PDF
 * is ready, then redirects to display it — no manual refresh needed.
 */
function processingPageHtml(normalizedUrl: string): string {
  const pollPath = `/?url=${encodeURIComponent(normalizedUrl)}`;
  const displayUrl = escapeHtml(normalizedUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Generating PDF...</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;color:#333}
.container{text-align:center;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
.spinner{width:40px;height:40px;margin:0 auto 1rem;border:4px solid #e0e0e0;border-top-color:#0070f3;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
p{margin:.5rem 0}
.url{color:#666;font-size:.9rem;word-break:break-all}
</style>
</head>
<body>
<div class="container">
<div class="spinner" id="spinner"></div>
<p id="status">Generating PDF...</p>
<p class="url">${displayUrl}</p>
</div>
<script>
(function(){var u=${JSON.stringify(pollPath)},r=0,m=${POLL_RETRIES},i=${POLL_INTERVAL_MS};
(function p(){fetch(u,{headers:{"Cache-Control":"no-cache"}}).then(function(f){
if((f.headers.get("content-type")||"").includes("application/pdf")){window.location.href=u;return}
r++;if(r>=m){document.getElementById("spinner").style.display="none";
document.getElementById("status").textContent="Taking longer than expected. Reload the page to try again.";return}
setTimeout(p,i)}).catch(function(){r++;if(r>=m){document.getElementById("spinner").style.display="none";
document.getElementById("status").textContent="Could not reach the server. Reload the page to try again.";return}
setTimeout(p,i)})})()})()
</script>
</body>
</html>`;
}

/**
 * Ensures a Workflow instance exists for the given URL.
 * Silently ignores duplicate (already_exists) errors.
 */
async function ensureWorkflow(env: Bindings, url: string): Promise<void> {
  try {
    await env.WORKFLOW.create({
      id: `workflow-${await md5(url)}`,
      params: { url },
    });
  } catch (err) {
    if (!(err instanceof Error && /^already_exists$/.test(err.message))) {
      throw err;
    }
  }
}

const app = new Hono<{ Bindings: Bindings }>();

/**
 * GET /
 *
 * Without a query parameter — returns service metadata as JSON.
 * With ?url=<url> — converts the given URL to PDF.
 */
app.get("/", async (c) => {
  const url = c.req.query("url");
  if (url == null) {
    return c.json({
      name: "url2pdf-workflow",
      version: "1.0.0",
      description: "Convert URLs to PDFs using Cloudflare Browser Rendering",
      source: "https://github.com/rjoydip/url2pdf-workflow",
      endpoints: {
        "/": "Service metadata (this response)",
        "/?url=<url>": "Convert a URL to PDF",
      },
    });
  }

  const parsed = parseUrl(url);
  if (!parsed) return c.text("Bad Request: invalid or missing url parameter", 400);

  const cacheKey = normalizeUrl(parsed);

  const cached = await c.env.BUCKET.get(cacheKey);
  if (cached) {
    const expiresAt = cached.customMetadata?.expiresAt;
    if (!expiresAt || Date.now() > Number(expiresAt)) {
      await c.env.BUCKET.delete(cacheKey).catch(() => {});
    } else {
      const data = await cached.arrayBuffer();
      return c.body(data, 200, { "content-type": "application/pdf" });
    }
  }

  await ensureWorkflow(c.env, cacheKey);
  return c.html(processingPageHtml(cacheKey));
});

export default app;
