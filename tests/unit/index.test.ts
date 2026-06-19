import { describe, expect, test, mock, beforeAll } from "bun:test";
import type { Hono } from "hono";

let app: Hono<{ Bindings: Bindings }>;

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
          new Response("%PDF-mock-content", {
            headers: { "content-type": "application/pdf" },
          }),
        ),
      ),
    },
    BUCKET: mockBucket() as unknown as R2Bucket,
    WORKFLOW: {
      create: mock(() => Promise.resolve({ id: "workflow-mock-id" })),
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

  const mod = await import("../../src/index");
  app = mod.default;
});

async function fetch(path?: string, bindings?: Partial<Bindings>): Promise<Response> {
  const url = path ?? "/url2pdf";
  return await app.request(url, {}, { ...mockBindings(), ...bindings } as Bindings);
}

describe("GET /", () => {
  test("returns service metadata", async () => {
    const res = await fetch("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body).toMatchObject({
      name: "url2pdf-workflow",
      endpoints: expect.objectContaining({
        "/": expect.any(String),
        "/url2pdf?url=<url>": expect.any(String),
      }),
    });
  });
});

function pdfUrl(url: string): string {
  return `/url2pdf?url=${encodeURIComponent(url)}`;
}

describe("GET /url2pdf", () => {
  test("missing url returns 404", async () => {
    const res = await fetch();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");
  });

  test("invalid url returns 404", async () => {
    const res = await fetch("/url2pdf?url=not-a-url");
    expect(res.status).toBe(404);
  });

  test("unsupported protocol returns 404", async () => {
    const res = await fetch("/url2pdf?url=ftp://example.com");
    expect(res.status).toBe(404);
  });

  test("returns cached pdf when bucket has it", async () => {
    const bucket = mockBucket() as unknown as R2Bucket;
    (bucket as any).get = mock(() =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      }),
    );

    const res = await fetch(pdfUrl("https://example.com"), { BUCKET: bucket });
    expect(res.status).toBe(200);
    expect(await res.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
  });

  test("creates workflow when url not cached", async () => {
    const create = mock(() => Promise.resolve({ id: "workflow-mock-id" }));

    const res = await fetch(pdfUrl("https://example.com"), { WORKFLOW: { create } });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Instance workflow-mock-id is processing");
    expect(create).toHaveBeenCalled();
  });

  test("returns already exists when workflow throws duplicate", async () => {
    const create = mock(() => Promise.reject(new Error("already_exists")));

    const res = await fetch(pdfUrl("https://example.com"), { WORKFLOW: { create } });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Instance already exists");
  });

  test("re-throws non-duplicate workflow errors", async () => {
    const create = mock(() => Promise.reject(new Error("network error")));

    const res = await fetch(pdfUrl("https://example.com"), { WORKFLOW: { create } });

    expect(res.status).toBe(500);
  });
});
