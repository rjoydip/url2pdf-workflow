import { describe, expect, test, mock, beforeAll } from "bun:test";
import type { Hono } from "hono";

let app: Hono<{ Bindings: Bindings }>;

const encoder = new TextEncoder();
const pdfBytes = encoder.encode("%PDF-1.4 mock document content");

function mockBucket() {
  return {
    get: mock(() => Promise.resolve(null)),
    put: mock(() => Promise.resolve({ uploaded: new Date() })),
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
  };
}

function mockBindings(overrides?: Partial<Bindings>): Bindings {
  return {
    BROWSER: {
      quickAction: mock(() =>
        Promise.resolve(
          new Response(pdfBytes, {
            headers: { "content-type": "application/pdf" },
          }),
        ),
      ),
    },
    BUCKET: mockBucket() as unknown as R2Bucket,
    WORKFLOW: {
      create: mock(() => Promise.resolve({ id: "wf-integration-test" })),
    },
    ...overrides,
  };
}

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

  mock.module("hono/utils/crypto", () => ({
    md5: (input: string) => Promise.resolve(input),
  }));

  const mod = await import("../src/index");
  app = mod.default;
});

async function fetch(query?: string, bindings?: Partial<Bindings>): Promise<Response> {
  const path = query ? `/url2pdf?url=${encodeURIComponent(query)}` : "/url2pdf";
  return await app.request(path, {}, { ...mockBindings(), ...bindings } as Bindings);
}

describe("full request lifecycle", () => {
  test("complete round-trip: cache miss → workflow → processing", async () => {
    const bucket = mockBucket() as unknown as R2Bucket;
    bucket.get = mock(() => Promise.resolve(null));

    const res = await fetch("https://example.com", { BUCKET: bucket });
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/Instance wf-integration-test is processing/);
  });

  test("complete round-trip: cache hit returns stored pdf", async () => {
    const bucket = mockBucket() as unknown as R2Bucket;
    (bucket as any).get = mock(() =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(pdfBytes.buffer),
      }),
    );

    const res = await fetch("https://example.com", { BUCKET: bucket });
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdfBytes);
  });

  test("cache miss with duplicate workflow returns already exists", async () => {
    const bucket = mockBucket() as unknown as R2Bucket;
    bucket.get = mock(() => Promise.resolve(null));

    const workflow = {
      create: mock(() => Promise.reject(new Error("already_exists"))),
    };

    const res = await fetch("https://example.com", {
      BUCKET: bucket,
      WORKFLOW: workflow,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Instance already exists");
  });

  test("non-existent bucket returns 500", async () => {
    const bucket = mockBucket() as unknown as R2Bucket;
    bucket.get = mock(() => Promise.reject(new Error("bucket not found")));

    const res = await fetch("https://example.com", {
      BUCKET: bucket,
    });
    expect(res.status).toBe(500);
  });
});

describe("validation edge cases", () => {
  test("empty string url", async () => {
    const res = await fetch("");
    expect(res.status).toBe(404);
  });

  test("url with only whitespace", async () => {
    const res = await fetch("   ");
    expect(res.status).toBe(404);
  });

  test("url with special characters", async () => {
    const res = await fetch("https://example.com/path?q=a b&c=d#frag");
    expect(res.status).toBe(200);
  });

  test("https protocol", async () => {
    const res = await fetch("https://example.com");
    expect(res.status).toBe(200);
  });

  test("http protocol", async () => {
    const res = await fetch("http://example.com");
    expect(res.status).toBe(200);
  });
});

describe("deployed endpoint", () => {
  const deployedUrl = (Bun as any).env.DEPLOYED_URL;

  if (deployedUrl) {
    test("smoke: returns 404 for missing url", async () => {
      const res = await fetch(`${deployedUrl}/url2pdf`);
      expect(res.status).toBe(404);
    });

    test("smoke: returns 500 for unreachable url", async () => {
      const res = await fetch(`${deployedUrl}/url2pdf?url=https://invalid.invalid`);
      expect(res.status).toBe(500);
    });

    test("smoke: health check returns 200 for reachable url", async () => {
      const res = await fetch(`${deployedUrl}/url2pdf?url=https://example.com`);
      expect(res.ok).toBe(true);
    });
  }
});
