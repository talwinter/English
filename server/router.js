// Talks to the MikroTik router. The router has two scripts (see router/discord-lock.rsc):
//   eq-block    turns on the Discord rules for his devices
//   eq-unblock  turns them off
// The server only runs those scripts over SSH, so the router user needs very few rights.

const { execFile } = require("child_process");

function createRouter(env, log) {
  const mode = (env.ROUTER_MODE || "mock").toLowerCase();

  if (mode === "mock") {
    // For testing without a router: only writes to the log.
    return {
      mode,
      run: async (command) => { log(`[mock router] ${command}`); return "ok"; },
    };
  }

  if (mode === "ssh") {
    const host = env.ROUTER_HOST;
    if (!host) throw new Error("ROUTER_HOST is required when ROUTER_MODE=ssh");
    const args = [
      "-i", env.ROUTER_SSH_KEY || "/data/ssh/id_ed25519",
      "-p", String(env.ROUTER_PORT || 22),
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", `UserKnownHostsFile=${env.ROUTER_KNOWN_HOSTS || "/data/ssh/known_hosts"}`,
      `${env.ROUTER_USER || "eq-lock"}@${host}`,
    ];
    return {
      mode,
      run: (command) => new Promise((resolve, reject) => {
        execFile(env.SSH_BIN || "ssh", [...args, command], { timeout: 20000 }, (err, stdout, stderr) => {
          if (err) reject(new Error((stderr || err.message).trim()));
          else resolve(stdout.trim());
        });
      }),
    };
  }

  throw new Error(`Unknown ROUTER_MODE "${mode}". Use "ssh" or "mock".`);
}

const COMMANDS = {
  lock: "/system script run eq-block",
  unlock: "/system script run eq-unblock",
  test: "/system identity print",
};

module.exports = { createRouter, COMMANDS };
