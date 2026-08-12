import dns from "node:dns/promises";

const domain = process.argv[2] || "gmail.com";

console.log(`Looking up MX records for: ${domain}`);
try {
  const records = await dns.resolveMx(domain);
  console.log("SUCCESS:", records);
} catch (err) {
  console.log("FAILED");
  console.log("  err.code:   ", err.code);
  console.log("  err.message:", err.message);
}
