// Uploads a game content pack (made by tools/make-update.ps1) to the real server.
//
//   node tools/push-update.js --file dist/update/content-<version>.pck --version <version> --to http://SERVER:8080
//
// The password is read from SERVER_ADMIN_PASSWORD (environment or .env), never typed on the command line.

const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const arg = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

try {
  for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/)) {
    const m = /^(SERVER_ADMIN_PASSWORD)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* no .env */ }

async function main() {
  const file = arg("file");
  const version = arg("version");
  const to = (arg("to") || "").replace(/\/+$/, "");
  if (!file || !version || !to) {
    console.error("Usage: node tools/push-update.js --file <pack.pck> --version <version> --to http://SERVER:8080");
    process.exit(1);
  }
  const pw = process.env.SERVER_ADMIN_PASSWORD;
  if (!pw) { console.error("Set SERVER_ADMIN_PASSWORD (the server's ADMIN_PASSWORD) in the environment or in .env."); process.exit(1); }
  const body = fs.readFileSync(file);
  console.log(`Uploading ${path.basename(file)} (${(body.length / 1048576).toFixed(1)} MB) to ${to} ...`);
  const r = await fetch(`${to}/admin/api/update/upload?version=${encodeURIComponent(version)}`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`parent:${pw}`).toString("base64"), "Content-Type": "application/octet-stream" },
    body,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.ok) { console.error(`The server did not accept it (${r.status}): ${out.error || "unknown"}`); process.exit(1); }
  console.log(`Done: version ${out.version} is on the server. His game takes it at its next start.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
