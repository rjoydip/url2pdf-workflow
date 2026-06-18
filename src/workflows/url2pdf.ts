import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";

type Payload = { url: string };
type PdfResult = {
  key: string;
  size: number;
  contentType: string;
  capturedAt: string;
};

export class Url2PdfWorkflow extends WorkflowEntrypoint<Bindings> {
  // eslint-disable-next-line no-useless-constructor
  constructor(ctx: any, env: Bindings) {
    super(ctx, env);
  }

  async run(event: WorkflowEvent<Payload>, step: WorkflowStep): Promise<PdfResult> {
    const { url } = event.payload;

    const result: PdfResult = await step.do(
      "generate-pdf",
      {
        retries: {
          limit: 3,
          delay: "5 seconds" as const,
          backoff: "exponential" as const,
        },
        timeout: "1 minute" as const,
      },
      () => this.generatePdf(url, event),
    );

    await step.do("verify-stored", () => this.verifyStored(result.key));

    return result;
  }

  private async generatePdf(url: string, event: WorkflowEvent<Payload>): Promise<PdfResult> {
    const response = await this.env.BROWSER.quickAction("pdf", { url });
    if (!response.ok) {
      throw new Error(`Failed to generate PDF for ${url}: ${response.status}`);
    }

    const data = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "application/pdf";
    const object = await this.env.BUCKET.put(url, data, {
      httpMetadata: { contentType },
    });

    return {
      key: url,
      size: data.byteLength,
      contentType,
      capturedAt: object?.uploaded.toISOString() ?? event.timestamp.toISOString(),
    };
  }

  private async verifyStored(key: string): Promise<void> {
    const head = await this.env.BUCKET.head(key);
    if (!head) {
      throw new Error(`PDF not found in R2 after upload: ${key}`);
    }
  }
}
