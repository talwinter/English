// Things every episode shares: the verb buttons and the game's own messages.
// Every English word here must be in dictionary.js (checked by tools/check-words.js).

(function (root) {
  const BASE = {
    verbs: [
      { id: "look", label: "Look at" },
      { id: "take", label: "Take" },
      { id: "open", label: "Open" },
      { id: "use", label: "Use", link: "on" },
      { id: "give", label: "Give", link: "to" },
      { id: "talk", label: "Talk to" },
      { id: "enter", label: "Enter" },
      { id: "go", label: "Go to" },
    ],
    ui: {
      bag: "Bag",
      notUnderstood: "I do not understand. Try: open the door.",
      notHere: "You do not see that here.",
      useWhat: "Use what? First click a thing in your bag.",
      giveWhat: "Give what? First click a thing in your bag.",
      levelDone: "Level complete!",
      defaults: {
        look: "You see nothing special.",
        take: "You can not take that.",
        open: "You can not open that.",
        use: "Nothing happens.",
        give: "No. That does not work.",
        talk: "It can not talk.",
        enter: "You can not enter that.",
        go: "You can not go there.",
      },
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = BASE;
  else root.BASE = BASE;
})(this);
