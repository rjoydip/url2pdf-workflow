/** Cloudflare Worker bindings configured via `wrangler.jsonc`. */
type Bindings = {
  /** Browser Rendering binding for PDF generation. */
  BROWSER: {
    quickAction(type: string, params: { url: string }): Promise<Response>;
  };
  /** R2 bucket used as a cache for generated PDFs. */
  BUCKET: R2Bucket;
  /** Workflow binding for durable PDF generation with retries. */
  WORKFLOW: {
    create(params: { id?: string; params: { url: string } }): Promise<{ id: string }>;
  };
};
