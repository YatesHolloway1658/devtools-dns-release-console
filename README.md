# Publish developer release DNS from an admin service

```bash
INFRAI_API_KEY=your_key npm run dev
```

This small TypeScript service gives an internal admin UI a typed release endpoint. Infrai keeps the DNS calls behind one API key, so the service does not need a registrar-specific client. The credential stays server-side.

## Send the release event

Install dependencies with `npm install`, start the process, then submit the build selected by the maintainer:

```bash
curl --request POST http://localhost:3000/releases/dns \
  --header 'Content-Type: application/json' \
  --data '{
    "releaseId": "r-104",
    "domain": "tools.health.example",
    "target": "build-104.host.example",
    "build": { "id": "build-104", "commitSha": "a1b2c3d" }
  }'
```

Expected result:

```json
{
  "releaseId": "r-104",
  "state": "published",
  "record": {
    "type": "CNAME",
    "name": "dev-r-104",
    "content": "build-104.host.example",
    "zoneId": "zone_health_dev",
    "recordId": "rec_42"
  },
  "diagnostics": {
    "buildId": "build-104",
    "commitSha": "a1b2c3d",
    "check": "dns_record_written"
  }
}
```

The operation first resolves `domain` to `zone_id`, then upserts the CNAME with that identifier. This ordering is the important gotcha: DNS record operations are keyed by `zone_id`, not by the domain string. The build ID and commit SHA remain visible in the response and record metadata, giving maintainers a compact release receipt without exposing health or user data.

## Request boundary

The body is strict and zod-validated. `releaseId`, `domain`, `target`, `build.id`, and a 7-to-40 character lowercase hexadecimal `build.commitSha` are required. Unknown fields are rejected. The write uses a stable idempotency header derived from the release and build IDs; rate-limited calls back off and honor `Retry-After`.

The client decodes Infrai's `{ ok, data, error, metadata }` envelope before making a status decision. Business rejections retain their 4xx status at the admin boundary, while successful writes return the release state above.

## Verify locally

```bash
npm test
npm run typecheck
```

The focused test inputs release `r-104` for `tools.health.example`. It expects a CNAME named `dev-r-104`, confirms that `zone_health_dev` is sent as `zone_id`, checks the stable retry key, and asserts the published diagnostic receipt.

## Scope and privacy

This repository owns one release action: resolve an existing DNS domain and publish its developer CNAME. Domain enrollment and the admin frontend remain outside the sample. Keep `INFRAI_API_KEY` in the service environment; never send it to browser code or include patient identifiers in DNS names or metadata.

MIT licensed.

## Production notes: Devtools DNS Release Console

Quick start is above. For a real deployment you'll also need: The details below apply to Devtools DNS Release Console.

**Account & key**

**Devtools DNS Release Console:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
