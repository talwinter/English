// When should Discord be locked?
//
// On every lock day, Discord locks at the lock time (e.g. 08:00) and stays locked until he completes
// that day's mission. A mission done earlier the same day (before the lock time) counts for that day.
// If he does not finish, the lock continues overnight until he does.

function parts(date, timeZone) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const weekday = (dateStr) => new Date(`${dateStr}T12:00:00Z`).getUTCDay(); // 0 = Sunday

function parseTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`Bad time "${hhmm}", use HH:MM like 08:00`);
  return +m[1] * 60 + +m[2];
}

function parseDays(spec) {
  const days = String(spec).split(",").map((d) => d.trim()).filter(Boolean).map(Number);
  if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error(`Bad days "${spec}", use numbers 0-6 (0 = Sunday), like 0,1,2,3,4,5,6`);
  }
  return days;
}

// config: { timeZone, lockAt (minutes after midnight), days: [0..6] }
// isDone(dateStr): did he complete the mission for that date?
// forceLock: a parent pressed "Lock now"; it lasts until the next completed mission.
function shouldLock(now, config, isDone, forceLock = false) {
  const { date: today, minutes } = parts(now, config.timeZone);
  const lockDay = (d) => config.days.includes(weekday(d));
  let locked;
  if (minutes >= config.lockAt) {
    locked = lockDay(today) && !isDone(today);
  } else {
    const yesterday = addDays(today, -1);
    locked = lockDay(yesterday) && !isDone(yesterday) && !isDone(today);
  }
  if (forceLock) locked = true;
  return { locked, today };
}

// The day a mission completed right now counts for.
const missionDate = (now, config) => parts(now, config.timeZone).date;

module.exports = { shouldLock, missionDate, parts, addDays, parseTime, parseDays };
