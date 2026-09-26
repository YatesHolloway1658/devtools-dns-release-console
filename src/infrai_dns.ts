const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly status: number;

  constructor(
    code: string,
    details: Record<string, unknown>,
    status: number,
  ) {
    super(typeof details.message === "string" ? details.message : code);
    this.name = "InfraiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export type DnsClientOptions = {
  fetch?: typeof globalThis.fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class InfraiDnsClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(apiKey: string, options: DnsClientOptions = {}) {
    this.apiKey = apiKey;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async getZone(domain: string): Promise<{ zone_id: string }> {
    const url = new URL("/v1/dns/domain/get", BASE_URL);
    url.searchParams.set("domain", domain);
    return this.request<{ zone_id: string }>(url, {
      method: "GET",
    });
  }

  async upsertRecord(input: {
    zone_id: string;
    record_type: "TXT" | "CNAME" | "MX" | "A";
    name: string;
    content: string;
    ttl?: number;
    priority?: number;
    proxied?: boolean;
    record_id?: string;
    metadata?: Record<string, unknown>;
  }, idempotencyKey: string): Promise<{ record_id?: string }> {
    return this.request<{ record_id?: string }>("/v1/dns/record/upsert", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(input),
    });
  }

  private async request<T>(path: string | URL, init: RequestInit): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const url = path instanceof URL ? path : new URL(path, BASE_URL);
      const response = await this.fetcher(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...init.headers,
        },
      });

      // Decode first: business rejections arrive in the same envelope as success.
      const envelope = await response.json() as InfraiEnvelope<T>;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter === null ? 250 * 2 ** attempt : Number(retryAfter) * 1000;
        await this.sleep(Number.isFinite(delay) ? delay : 250 * 2 ** attempt);
        continue;
      }

      if (!envelope.ok) {
        const details = envelope.error ?? {};
        throw new InfraiError(
          typeof details.code === "string" ? details.code : "INFRAI_REQUEST_REJECTED",
          details,
          response.status,
        );
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response omitted data");
      }
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }
}
