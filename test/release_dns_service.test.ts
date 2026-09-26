import assert from "node:assert/strict";
import test from "node:test";
import { InfraiDnsClient } from "../src/infrai_dns.js";
import { publishDeveloperRelease } from "../src/release_dns_service.js";

test("publishes a release CNAME with the resolved zone and stable retry key", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const responses = [
    Response.json({ ok: true, data: { zone_id: "zone_health_dev" }, metadata: {} }),
    Response.json({ ok: true, data: { record_id: "rec_42" }, metadata: {} }),
  ];
  const fetcher: typeof fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (response === undefined) throw new Error("Unexpected request");
    return response;
  };
  const dns = new InfraiDnsClient("test-key", { fetch: fetcher });

  const result = await publishDeveloperRelease(dns, {
    releaseId: "r-104",
    domain: "tools.health.example",
    target: "build-104.host.example",
    build: { id: "build-104", commitSha: "a1b2c3d" },
  });

  assert.equal(calls[0]?.init.method, "GET");
  const zoneLookupUrl = new URL(calls[0]?.url ?? "");
  assert.equal(zoneLookupUrl.pathname, "/v1/dns/domain/get");
  assert.equal(zoneLookupUrl.searchParams.get("domain"), "tools.health.example");
  assert.equal(calls[1]?.init.method, "PUT");
  assert.equal(new Headers(calls[1]?.init.headers).get("Idempotency-Key"), "dns-release:r-104:build-104");
  assert.deepEqual(JSON.parse(String(calls[1]?.init.body)), {
    zone_id: "zone_health_dev",
    record_type: "CNAME",
    name: "dev-r-104",
    content: "build-104.host.example",
    ttl: 300,
    proxied: false,
    metadata: { releaseId: "r-104", buildId: "build-104", commitSha: "a1b2c3d" },
  });
  assert.deepEqual(result, {
    releaseId: "r-104",
    state: "published",
    record: {
      type: "CNAME",
      name: "dev-r-104",
      content: "build-104.host.example",
      zoneId: "zone_health_dev",
      recordId: "rec_42",
    },
    diagnostics: { buildId: "build-104", commitSha: "a1b2c3d", check: "dns_record_written" },
  });
});
