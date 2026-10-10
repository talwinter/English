// Wake-on-LAN for the PC with the graphics card.
// At WAKE_TIME (for example 05:00), if pictures are waiting, the server asks the MikroTik router to wake
// the PC (router script eq-wake). The art worker starts at the login screen, makes the pictures, and then
// the server tells it that it may shut the PC down, because the server woke it. If someone is logged in
// on the PC, the worker never shuts it down.

const { parts } = require("./schedule");

const RETRY_MS = 20 * 60 * 1000;          // wake again once if the worker did not show up
const SHUTDOWN_WINDOW_MS = 6 * 60 * 60 * 1000;

function createWake({ wakeAt, timeZone, router, art, log, command = "/system script run eq-wake" }) {
  let lastWakeDate = null;  // the day we already handled
  let wokeAt = 0;
  let retried = false;

  async function wake(reason, now = new Date()) {
    await router.run(command);
    wokeAt = now.getTime();
    retried = false;
    log(`Woke the art PC (${reason})`);
  }

  // Called every 30 seconds by the server.
  async function tick(now = new Date()) {
    if (wakeAt == null) return;
    const { date, minutes } = parts(now, timeZone);
    if (minutes >= wakeAt && minutes < wakeAt + 60 && lastWakeDate !== date) {
      lastWakeDate = date;
      if (art.pendingCount() > 0) await wake(`${art.pendingCount()} pictures waiting`, now);
    }
    // The PC did not ask for work 20 minutes after waking: try once more.
    const seen = art.workerSeenAt();
    if (wokeAt && !retried && now - wokeAt > RETRY_MS && (!seen || seen < wokeAt) && art.pendingCount() > 0) {
      retried = true;
      await router.run(command);
      log("The art PC did not answer, woke it again");
    }
  }

  // The worker may shut the PC down when we woke it recently (and it has no more work).
  const mayShutdown = (now = Date.now()) => !!wokeAt && now - wokeAt < SHUTDOWN_WINDOW_MS;
  const shutdownSent = () => { wokeAt = 0; };

  return { tick, wake, mayShutdown, shutdownSent, get enabled() { return wakeAt != null; } };
}

module.exports = { createWake };
