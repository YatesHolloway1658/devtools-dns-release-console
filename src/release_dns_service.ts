import { z } from "zod";
import { InfraiDnsClient } from "./infrai_dns.js";

export const releaseRequestSchema = z.object({
  releaseId: z.string().min(1).max(80),
  domain: z.string().min(3).max(253),
  target: z.string().min(3).max(253),
  build: z.object({
    id: z.string().min(1).max(80),
    commitSha: z.string().regex(/^[a-f0-9]{7,40}$/),
  }),
}).strict();

export type ReleaseRequest = z.infer<typeof releaseRequestSchema>;

export type ReleaseResult = {
  releaseId: string;
  state: "published";
  record: { type: "CNAME"; name: string; content: string; zoneId: string; recordId?: string };
  diagnostics: { buildId: string; commitSha: string; check: "dns_record_written" };
};

export async function publishDeveloperRelease(
  dns: InfraiDnsClient,
  input: ReleaseRequest,
): Promise<ReleaseResult> {
  const { zone_id } = await dns.getZone(input.domain);
  const name = `dev-${input.releaseId}`;
  const record = await dns.upsertRecord({
    zone_id,
    record_type: "CNAME",
    name,
    content: input.target,
    ttl: 300,
    proxied: false,
    metadata: {
      releaseId: input.releaseId,
      buildId: input.build.id,
      commitSha: input.build.commitSha,
    },
  }, `dns-release:${input.releaseId}:${input.build.id}`);

  return {
    releaseId: input.releaseId,
    state: "published",
    record: {
      type: "CNAME",
      name,
      content: input.target,
      zoneId: zone_id,
      ...(record.record_id === undefined ? {} : { recordId: record.record_id }),
    },
    diagnostics: {
      buildId: input.build.id,
      commitSha: input.build.commitSha,
      check: "dns_record_written",
    },
  };
}
