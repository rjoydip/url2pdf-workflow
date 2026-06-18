import { describe, expect, test, mock, beforeAll } from "bun:test";

let Url2PdfWorkflow: any;

beforeAll(async () => {
  mock.module("cloudflare:workers", () => {
    class WorkflowEntrypoint<Env> {
      env: Env;
      constructor(_ctx: unknown, env: Env) {
        this.env = env;
      }
    }
    return { WorkflowEntrypoint };
  });

  const mod = await import("../../../src/workflows/url2pdf");
  Url2PdfWorkflow = mod.Url2PdfWorkflow;
});

function makeEvent(url: string) {
  return {
    payload: { url },
    timestamp: new Date("2026-01-01T00:00:00Z"),
    instance: { id: "test-instance" },
  };
}

function makeStep(impl?: (...args: any[]) => any) {
  return {
    do: mock((...args: any[]): Promise<any> => {
      if (impl) return Promise.resolve(impl(...args));
      const cb = args.length === 3 ? args[2] : args[1];
      return Promise.resolve((cb as () => any)());
    }),
  };
}

function makeEnv(): Bindings {
  return {
    BROWSER: {
      quickAction: mock(() =>
        Promise.resolve(
          new Response("%PDF-data", {
            headers: { "content-type": "application/pdf" },
          }),
        ),
      ),
    },
    BUCKET: {
      get: mock(() => Promise.resolve(null)),
      put: mock(() => Promise.resolve({ uploaded: new Date("2026-01-01T00:00:00Z") })),
      head: mock(() => Promise.resolve({ uploaded: new Date() })),
      delete: mock(() => Promise.resolve()),
      createMultipartUpload: mock(() => {
        throw new Error("not implemented");
      }),
      resumeMultipartUpload: mock(() => {
        throw new Error("not implemented");
      }),
      list: mock(() =>
        Promise.resolve({
          objects: [] as never[],
          truncated: false as const,
          delimitedPrefixes: [] as string[],
        }),
      ),
    } as unknown as R2Bucket,
    WORKFLOW: {
      create: mock(() => Promise.resolve({ id: "w-1" })),
    },
  };
}

describe("Url2PdfWorkflow", () => {
  test("run method succeeds", async () => {
    const env = makeEnv();
    const workflow = new Url2PdfWorkflow({} as any, env);
    Object.assign(workflow, { env });

    const result: any = await workflow.run(makeEvent("https://example.com"), makeStep());

    expect(result.key).toBe("https://example.com");
    expect(result.size).toBe(9);
    expect(result.contentType).toBe("application/pdf");
    expect(result.capturedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  test("throws when browser rendering fails", async () => {
    const env = makeEnv();
    env.BROWSER.quickAction = mock(() => Promise.resolve(new Response(null, { status: 502 })));
    const workflow = new Url2PdfWorkflow({} as any, env);
    Object.assign(workflow, { env });

    await expect(workflow.run(makeEvent("https://example.com"), makeStep())).rejects.toThrow(
      "Failed to generate PDF for https://example.com: 502",
    );
  });

  test("verify step throws when object not in bucket", async () => {
    const env = makeEnv();
    env.BUCKET.head = mock(() => Promise.resolve(null));
    const workflow = new Url2PdfWorkflow({} as any, env);
    Object.assign(workflow, { env });

    let callCount = 0;
    const step = makeStep((...args: any[]) => {
      callCount++;
      const cb = args.length === 3 ? args[2] : args[1];
      if (callCount === 2) {
        return expect((cb as () => Promise<any>)()).rejects.toThrow("not found in R2");
      }
      return (cb as () => Promise<any>)();
    });

    await workflow.run(makeEvent("https://example.com"), step);
  });

  test("generatePdf stores in bucket", async () => {
    const env = makeEnv();
    const put = mock(() => Promise.resolve({ uploaded: new Date("2026-01-01T00:00:00Z") }));
    (env.BUCKET as any).put = put;
    const workflow = new Url2PdfWorkflow({} as any, env);
    Object.assign(workflow, { env });

    const step = makeStep();
    const result: any = await workflow.run(makeEvent("https://example.com"), step);

    expect(put).toHaveBeenCalledWith(
      "https://example.com",
      expect.anything(),
      expect.objectContaining({
        httpMetadata: { contentType: "application/pdf" },
      }),
    );
    expect(result.key).toBe("https://example.com");
  });

  test("uses event timestamp when object has no uploaded date", async () => {
    const env = makeEnv();
    (env.BUCKET as any).put = mock(() => Promise.resolve(null));
    const workflow = new Url2PdfWorkflow({} as any, env);
    Object.assign(workflow, { env });

    const result: any = await workflow.run(makeEvent("https://example.com"), makeStep());

    expect(result.capturedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.key).toBe("https://example.com");
    expect(result.size).toBe(9);
  });

  test("falls back to application/pdf when content-type header is missing", async () => {
    const env = makeEnv();
    env.BROWSER.quickAction = mock(() => Promise.resolve(new Response("%PDF-data")));
    const workflow = new Url2PdfWorkflow({} as any, env);
    Object.assign(workflow, { env });

    const result: any = await workflow.run(makeEvent("https://example.com"), makeStep());

    expect(result.contentType).toBe("application/pdf");
  });

  test("constructor sets env from args", async () => {
    const env = makeEnv();
    const workflow = new Url2PdfWorkflow({} as any, env);
    Object.assign(workflow, { env });

    expect(workflow.env).toBe(env);
    expect(workflow.env.BROWSER).toBeDefined();
    expect(workflow.env.BUCKET).toBeDefined();
    expect(workflow.env.WORKFLOW).toBeDefined();
  });
});
