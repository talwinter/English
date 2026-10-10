class_name WordStore
extends RefCounted
## What he knows about each English word. Saved on this computer (user://words.json), so it survives
## between sessions. A word is:
##   NEW       he has met it but never asked what it means (gold in the text)
##   LEARNING  he clicked it or was quizzed, but is not sure yet (pale)
##   MASTERED  he got it right in practice enough times, or said "I know it" (plain white)
## Practice uses simple spaced-repetition boxes: right answers move a word up, a wrong answer sends it back.

enum State { NEW, LEARNING, MASTERED }

const FILE := "user://words.json"
const MASTER_BOX := 3

var words: Dictionary = {}     # word -> { seen, looked, right, wrong, box, known, first }
var function_words: Dictionary = {}
var _word_re: RegEx


func _init() -> void:
	_word_re = RegEx.new()
	_word_re.compile("[A-Za-z]+(?:'[A-Za-z]+)?")


func load_file(path: String = FILE) -> void:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return
	var data: Variant = JSON.parse_string(f.get_as_text())
	if data is Dictionary:
		words = data


func save_file(path: String = FILE) -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(words))


func entry(w: String) -> Dictionary:
	if not words.has(w):
		words[w] = {"seen": 0, "looked": 0, "right": 0, "wrong": 0, "box": 0, "known": false,
			"first": Time.get_unix_time_from_system()}
	return words[w]


func is_content_word(w: String) -> bool:
	return not function_words.has(w)


## Counts the words of a text he has just been shown.
func mark_seen_text(text: String) -> void:
	for m in _word_re.search_all(text):
		var w := m.get_string().to_lower()
		entry(w)["seen"] = int(entry(w)["seen"]) + 1


func looked(w: String) -> void:
	var e := entry(w)
	e["looked"] = int(e["looked"]) + 1
	save_file()


func answer(w: String, ok: bool) -> void:
	var e := entry(w)
	if ok:
		e["right"] = int(e["right"]) + 1
		e["box"] = mini(int(e["box"]) + 1, 4)
	else:
		e["wrong"] = int(e["wrong"]) + 1
		e["box"] = 0
	save_file()


func mark_known(w: String) -> void:
	var e := entry(w)
	e["known"] = true
	e["box"] = maxi(int(e["box"]), MASTER_BOX)
	save_file()


func state(w: String) -> int:
	if not words.has(w):
		return State.NEW
	var e: Dictionary = words[w]
	if bool(e["known"]) or int(e["box"]) >= MASTER_BOX:
		return State.MASTERED
	if int(e["looked"]) > 0 or int(e["right"]) + int(e["wrong"]) > 0:
		return State.LEARNING
	return State.NEW


## Words he has met (content words with a translation), newest first.
func met_words(dictionary: Dictionary) -> Array:
	var out: Array = []
	for w in words:
		if dictionary.has(w) and is_content_word(w) and int(words[w]["seen"]) > 0:
			out.append(w)
	out.sort_custom(func(a: String, b: String) -> bool: return float(words[a]["first"]) > float(words[b]["first"]))
	return out


func counts(dictionary: Dictionary) -> Dictionary:
	var c := {"met": 0, "new": 0, "learning": 0, "mastered": 0}
	for w in met_words(dictionary):
		c["met"] += 1
		match state(w):
			State.NEW: c["new"] += 1
			State.LEARNING: c["learning"] += 1
			State.MASTERED: c["mastered"] += 1
	return c


## Words to practise, the ones he needs most first (clicked or wrong often, low box).
func practice_pool(dictionary: Dictionary, rng: RandomNumberGenerator = null) -> Array:
	var r := rng if rng != null else RandomNumberGenerator.new()
	var scored: Array = []
	for w in met_words(dictionary):
		var e: Dictionary = words[w]
		var score := float(e["looked"]) * 2.0 + float(e["wrong"]) * 3.0 - float(e["right"]) * 1.0 \
			- float(e["box"]) * 1.5 + r.randf() * 2.0
		if bool(e["known"]):
			score -= 4.0
		scored.append([w, score])
	scored.sort_custom(func(a: Array, b: Array) -> bool: return a[1] > b[1])
	return scored.map(func(x: Array) -> String: return x[0])


## Builds up to `count` multiple-choice questions: { word, he, options: [he, he, he], answer: index }.
func make_quiz(dictionary: Dictionary, count: int = 8, rng: RandomNumberGenerator = null) -> Array:
	var r := rng if rng != null else RandomNumberGenerator.new()
	var pool := practice_pool(dictionary, r)
	var out: Array = []
	if pool.size() < 4:
		return out
	var chosen := pool.slice(0, mini(count, pool.size()))
	for w in chosen:
		var right := String(dictionary[w])
		var wrong: Array = []
		var tries := 0
		while wrong.size() < 2 and tries < 60:
			tries += 1
			var other: String = pool[r.randi_range(0, pool.size() - 1)]
			var he := String(dictionary[other])
			if other != w and he != right and not wrong.has(he):
				wrong.append(he)
		if wrong.size() < 2:
			continue
		var options := [right] + wrong
		for i in range(options.size() - 1, 0, -1):
			var j := r.randi_range(0, i)
			var t = options[i]
			options[i] = options[j]
			options[j] = t
		out.append({"word": w, "he": right, "options": options, "answer": options.find(right)})
	return out
