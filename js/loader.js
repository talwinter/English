// Picks the episode to play and loads it with its Hebrew words.
//   /                      today's episode (from the server)
//   /?episode=s1e2         a published episode
//   /?draft=s1e3           a draft, for the parent to try before approving (needs the parent password)
// Without the server (index.html opened as a file) it plays the built-in Episode 1.

window.loadEpisode = async function () {
  const params = new URLSearchParams(location.search);
  const dict = { ...window.DICT };
  let episode = null, preview = false;

  if (location.protocol !== "file:") {
    const draft = params.get("draft");
    const wanted = params.get("episode");
    const url = draft
      ? `/admin/api/draft/${encodeURIComponent(draft)}`
      : `/api/play${wanted ? `?episode=${encodeURIComponent(wanted)}` : ""}`;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        episode = data.episode;
        Object.assign(dict, data.dictionary || {});
        preview = !!draft;
      }
    } catch { /* no server: play the built-in episode */ }
  }

  if (!episode) episode = window.EPISODES.s1e1;
  for (const d of episode.dictionary || []) dict[d.en.toLowerCase()] = d.he;
  window.DICT = dict;
  return { game: window.Episode.compile(episode, window.BASE), dict, preview, served: location.protocol !== "file:" };
};
