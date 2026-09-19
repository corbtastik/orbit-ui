import fs from "node:fs";
import path from "node:path";

// Tool-traffic logging.
//
// This app exists to call tools, so what the tool loop did is the primary
// diagnostic and belongs in a file that can be tailed on its own -- not
// interleaved with Vite output on stdout. A single answer can run 45-90
// seconds across 20+ tool rounds, and none of that is visible from the
// browser.
//
// Deliberately permanent.

const LOG_PATH =
  process.env.ORBIT_LOG_FILE ??
  path.resolve(process.cwd(), "logs", "orbit.log");

let stream = null;

function getStream() {
  if (stream) return stream;
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  stream = fs.createWriteStream(LOG_PATH, { flags: "a" });
  stream.write(`\n===== orbit-ui started ${new Date().toISOString()} =====\n`);
  return stream;
}

export const logPath = () => LOG_PATH;

export function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.join(" ")}\n`;
  try {
    getStream().write(line);
  } catch {
    // A logging failure must never take down a chat turn.
  }
}
