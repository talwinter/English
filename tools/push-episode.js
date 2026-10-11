// Moves an episode that was made on the dev PC to the real server, as a draft waiting for approval there.
//
//   node tools/push-episode.js --id s1e3 --to http://192.168.2.47:8080
//
// The passwords are read from the environment, never typed on the command line or in a chat:
//   DEV_ADMIN_PASSWORD     the dev server's parent password (default "dev")
//   SERVER_ADMIN_PASSWORD  the real server's parent password (the ADMIN_PASSWORD of its .env)
// The server checks the episode again (words, robot, rooms) and only then lists it on the parent page.

const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const arg = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

try {   // .env of the project, if the passwords are kept there
  for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/)) {
    const m = /^(SERVER_ADMIN_PASSWORD|DEV_ADMIN_PASSWORD)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* no .env */ }

async function main() {
  const id = arg("id");
  const from = (arg("from", "http://localhost:8081")).replace(/\/+$/, "");
  const to = (arg("to") || "").replace(/\/+$/, "");
  if (!id || !to) {
    console.error("Usage: node tools/push-episode.js --id s1e3 --to http://SERVER:8080 [--from http://localhost:8081]");
    process.exit(1);
  }
  const auth = (pw) => "Basic " + Buffer.from(`parent:${pw}`).toString("base64");
  const fromPw = process.env.DEV_ADMIN_PASSWORD || "dev";
  const toPw = process.env.SERVER_ADMIN_PASSWORD;
  if (!toPw) { console.error("Set SERVER_ADMIN_PASSWORD (the real server's ADMIN_PASSWORD), in the environment or in .env."); process.exit(1); }

  const r1 = await fetch(`${from}/admin/api/draft/${id}`, { headers: { Authorization: auth(fromPw) } });
  if (!r1.ok) { console.error(`Could not read ${id} from ${from}: ${r1.status}`); process.exit(1); }
  const { episode } = await r1.json();
  console.log(`Read ${id} "${episode.title}" from ${from}`);

  const r2 = await fetch(`${to}/admin/api/episodes/import`, {
    method: "POST",
    headers: { Authorization: auth(toPw), "Content-Type": "application/json" },
    body: JSON.stringify({ episode, source: "the dev PC" }),
  });
  const out = await r2.json().catch(() => ({}));
  if (!r2.ok || !out.ok) { console.error(`The server did not accept it (${r2.status}): ${out.error || "unknown"}`); process.exit(1); }
  console.log(`Done: ${out.id} is waiting for approval on ${to}/admin`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
