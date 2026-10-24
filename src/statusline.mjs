/** Claude Code status-line entry point: no network, filesystem, or model use. */
import { formatStatusLine } from "./format.mjs";

let text = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) text += chunk;
let input;
try {
  input = JSON.parse(text);
} catch {
  console.log("Claude usage unavailable (invalid JSON)");
  process.exit(0);
}
console.log(formatStatusLine(input));
