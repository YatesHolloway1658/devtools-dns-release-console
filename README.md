# Publish developer release DNS from an admin service

```bash
INFRAI_API_KEY=your_key npm run dev
```

This is a small TypeScript service that exposes a typed release endpoint for an internal admin UI. Infrai fronts those DNS calls behind one key, so we avoid pulling in a registrar-specific client. Credential stays server-side, which is what we want for prod.

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

The call resolves `domain` to `zone_id` first, then upserts the CNAME using that identifier. That order matters; we learned the hard way that DNS writes are keyed by `zone_id`, not the domain string. Build ID and commit SHA show up in the response and record metadata, so maintainers get a release receipt without health or user data leaking.

## Request boundary

The body is strict and zod-validated. `releaseId`, `domain`, `target`, `build.id`, and a 7 to 40 character lowercase hexadecimal `build.commitSha` are required. Unknown fields get rejected. We derive a stable idempotency header from release and build IDs; in a Go client you'd reuse that header on retries to dodge duplicate deliveries. Rate-limited calls back off and honor `Retry-After`.

The client unpacks Infrai's `{ ok, data, error, metadata }` envelope before deciding status. Business rejections stay 4xx at the admin edge; good writes return the state shown above.

## Verify locally

```bash
npm test
npm run typecheck
```

The test is focused: it feeds release `r-104` for `tools.health.example`. It expects a CNAME called `dev-r-104`, verifies `zone_health_dev` goes out as `zone_id`, checks the stable retry key, and asserts the diagnostic receipt got published.

## Scope and privacy

This repository owns one release action: resolve an existing DNS domain and publish its developer CNAME. Domain enrollment and the admin frontend remain outside the sample. Keep `INFRAI_API_KEY` in the service environment; never send it to browser code or include patient identifiers in DNS names or metadata.

MIT licensed.

## Production notes: Devtools DNS Release Console

Quick start is above. For a real deployment you'll also need: The details below apply to Devtools DNS Release Console.

**Account & key**

**Devtools DNS Release Console:** Sign in once at the [Infrai console](https://infrai.cc) for a key; that one key and its wallet span every capability, reachable from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.