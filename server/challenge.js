// The daily word challenge. The server keeps the right answers, so the challenge can't be
// skipped from the browser. 8 quick questions with 4 choices each; 6 right answers pass.

const crypto = require("crypto");

const QUESTIONS = 8;
const PASS = 6;
const CHOICES = 4;
const EXPIRES_MS = 20 * 60 * 1000;
const RETRY_WAIT_MS = 15 * 1000;

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function createChallenges(dict) {
  let current = null;
  let retryAt = 0;

  // words: English words to ask about (already in the dictionary)
  // prefer: words he finds hard; some of them are asked first.
  function start(words, now = Date.now(), prefer = []) {
    if (now < retryAt) return { error: "wait", seconds: Math.ceil((retryAt - now) / 1000) };
    const pool = [...new Set(words)].filter((w) => dict[w]);
    if (pool.length < CHOICES) return { error: "no-words" };

    const weak = shuffle(prefer.filter((w) => pool.includes(w))).slice(0, Math.floor(QUESTIONS / 2));
    const picked = [...weak, ...shuffle(pool.filter((w) => !weak.includes(w)))].slice(0, QUESTIONS);
    const questions = picked.map((word, i) => {
      // Wrong choices must not share the same meaning (like "need" and "needs").
      const others = shuffle(pool.filter((w) => w !== word && dict[w] !== dict[word])).slice(0, CHOICES - 1);
      const toHebrew = i % 2 === 0;
      const options = shuffle([word, ...others]);
      return {
        type: toHebrew ? "en-he" : "he-en",
        prompt: toHebrew ? word : dict[word],
        options: options.map((w) => (toHebrew ? dict[w] : w)),
        answer: options.indexOf(word),
        word,
      };
    });
    current = { id: crypto.randomUUID(), questions, next: 0, score: 0, expires: now + EXPIRES_MS };
    return {
      id: current.id,
      pass: Math.min(PASS, questions.length),
      questions: questions.map(({ type, prompt, options }) => ({ type, prompt, options })),
    };
  }

  function answer(id, q, choice, now = Date.now()) {
    if (!current || current.id !== id || now > current.expires) return { error: "expired" };
    if (q !== current.next) return { error: "order" };
    const question = current.questions[q];
    const correct = choice === question.answer;
    if (correct) current.score++;
    current.next++;
    const total = current.questions.length;
    const done = current.next >= total;
    const passed = done && current.score >= Math.min(PASS, total);
    const result = { correct, answer: question.answer, word: question.word, score: current.score, done, passed };
    if (done) {
      if (!passed) retryAt = now + RETRY_WAIT_MS;
      current = null;
    }
    return result;
  }

  return { start, answer };
}

module.exports = { createChallenges, QUESTIONS, PASS };
