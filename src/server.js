import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { verifyEmail } from "./verifyEmail.js";

const server = new McpServer({
  name: "inboxvalid-mcp",
  version: "1.0.0",
});

server.registerTool(
  "verify_email",
  {
    title: "Verify Email",
    description:
      "Verifies an email address's deliverability plausibility: syntax, " +
      "disposable-domain, and MX-record checks. Returns a structured " +
      "status ('valid' | 'invalid' | 'risky') with a machine-readable " +
      "reason code - never throws on a bad address, always returns a result.",
    inputSchema: {
      address: z.string().describe("The email address to verify, e.g. 'user@example.com'"),
    },
  },
  async ({ address }) => {
   
    try {
      const result = await verifyEmail(address);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (err) {
      const fallback = {
        email: address,
        status: "risky",
        reason: "internal_error",
        checks: null,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(fallback, null, 2) }],
        structuredContent: fallback,
        isError: false, // deliberate: an unverifiable address is a result, not a protocol failure
      };
    }
  }
);
const transport = new StdioServerTransport();
await server.connect(transport);
