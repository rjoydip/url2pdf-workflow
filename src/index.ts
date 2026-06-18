import { Hono } from "hono";
import { md5 } from "hono/utils/crypto";
export { Url2PdfWorkflow } from "./workflows/url2pdf";

function parseUrl(url: string | undefined): URL | null {
  if (!url) return null;
  const parsed = URL.parse(url);
  if (!parsed || !/^https?:$/.test(parsed.protocol)) return null;
  return parsed;
}

async function startWorkflow(env: Bindings, url: string): Promise<Response> {
  const instance = await env.WORKFLOW.create({
    id: `workflow-${await md5(url)}`,
    params: { url },
  }).catch((err) => {
    if (err instanceof Error && err.message.includes("already_exists")) {
      return null;
    }
    throw err;
  });

  if (!instance) return new Response("Instance already exists");
  return new Response(`Instance ${instance.id} is processing`);
}

const app = new Hono<{ Bindings: Bindings }>();

app.get("/url2pdf", async (c) => {
  const url = c.req.query("url");
  const parsed = parseUrl(url);
  if (!parsed) return c.text("Not Found", 404);

  const cached = await c.env.BUCKET.get(url!);
  if (cached) return c.body(await cached.arrayBuffer());

  return startWorkflow(c.env, url!);
});

export default app;
