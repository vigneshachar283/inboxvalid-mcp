// Manual end-to-end test: spins up the MCP server as a subprocess and
// drives it exactly the way a real MCP client (e.g. Claude, an agent
// framework) would - over stdio, using the SDK's Client class. This is
// the script to run for the demo recording.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const TEST_CASES = [
  "someone@gmail.com",       // expected: valid
  "not-an-email",             // expected: invalid, malformed_syntax
  "user@mailinator.com",      // expected: risky, disposable_domain
  "user@this-domain-should-not-exist-xyz123.com", // expected: invalid, no_mx_record
  "  someone@gmail.com  ",    // expected: valid — leading/trailing whitespace is trimmed, not rejected
  "some one@gmail.com",       // expected: invalid, contains_whitespace (internal space)
  "",                          // expected: invalid, empty
];

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["src/server.js"],
  });

  const client = new Client({ name: "manual-test-client", version: "1.0.0" });
  await client.connect(transport);

  console.log("Connected. Tools available:");
  const { tools } = await client.listTools();
  console.log(tools.map((t) => t.name));
  console.log("\n--- verify_email results ---\n");

  for (const email of TEST_CASES) {
    const result = await client.callTool({
      name: "verify_email",
      arguments: { address: email },
    });
    console.log(`Input: ${JSON.stringify(email)}`);
    console.log(result.structuredContent);
    console.log("");
  }

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Test client failed:", err);
  process.exit(1);
});
