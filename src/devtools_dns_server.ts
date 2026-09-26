import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiDnsClient, InfraiError } from "./infrai_dns.js";
import { publishDeveloperRelease, releaseRequestSchema } from "./release_dns_service.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const dns = new InfraiDnsClient(apiKey);
const port = Number(process.env.PORT ?? 3000);

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/releases/dns") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = releaseRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    send(response, 201, await publishDeveloperRelease(dns, input));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid release request" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, details: error.details });
      return;
    }
    send(response, 500, { error: "Release operation failed" });
  }
});

server.listen(port, () => {
  console.log(`Developer DNS service listening on http://localhost:${port}`);
});
