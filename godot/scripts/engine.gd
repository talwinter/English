class_name EpisodeEngine
extends RefCounted
## The rules of an episode, ported from js/episode.js and js/game.js (same data, same choices).
## Episodes are plain data (see the top of js/episode.js). This class holds the state (flags, bag, goal,
## points) and answers actions: act("use", "computer", "cable") -> what to say and what happens.
## It knows nothing about 3D, UI or sound.

const TWO_STEP := ["use", "give"]
const VERB_PHRASES := [
	["look at", "look"], ["look", "look"], ["see", "look"], ["check", "look"],
	["pick up", "take"], ["take", "take"], ["get", "take"], ["grab", "take"],
	["open", "open"], ["unlock", "open"], ["use", "use"], ["give", "give"],
	["talk to", "talk"], ["talk", "talk"], ["speak to", "talk"], ["speak", "talk"],
	["go into", "enter"], ["go in", "enter"], ["get in", "enter"], ["enter", "enter"],
	["go to", "go"], ["go", "go"], ["walk to", "go"], ["walk", "go"], ["cross", "go"], ["run to", "go"],
]
const STOP := ["the", "a", "an", "at", "to", "on", "with", "in", "into", "my", "your", "up", "please", "and", "of"]

var episode: Dictionary = {}
var base: Dictionary = {}
var scenes: Dictionary = {}     # id -> scene
var items: Dictionary = {}      # id -> item
var goals: Dictionary = {}      # id -> goal
var global_rules: Array = []
var state: Dictionary = {}
var player_name := ""


func load_episode(data: Dictionary, base_data: Dictionary) -> void:
	episode = data
	base = base_data
	scenes.clear()
	items.clear()
	goals.clear()
	for sc in data.get("scenes", []):
		scenes[sc["id"]] = sc
	for it in data.get("items", []):
		items[it["id"]] = it
	for g in data.get("goals", []):
		goals[g["id"]] = g
	global_rules = data.get("globalRules", [])
	var start: Dictionary = data.get("start", {})
	state = {
		"scene": start.get("scene", ""), "goal": start.get("goal", ""), "flags": {}, "bag": [],
		"points": {}, "visited": {}, "hints": {}, "finished": false,
	}


static func _list(v: Variant) -> Array:
	if v == null:
		return []
	if v is Array:
		return v
	return [v]


# ---------- state queries

func flag(f: String) -> bool:
	return state["flags"].has(f)


func has_item(i: String) -> bool:
	return (state["bag"] as Array).has(i)


func cond_ok(c: Variant) -> bool:
	if c == null or not (c is Dictionary):
		return true
	var d: Dictionary = c
	for f in _list(d.get("flags")):
		if not flag(f):
			return false
	for f in _list(d.get("notFlags")):
		if flag(f):
			return false
	for i in _list(d.get("has")):
		if not has_item(i):
			return false
	for i in _list(d.get("notHas")):
		if has_item(i):
			return false
	return true


func scene() -> Dictionary:
	return scenes.get(state["scene"], {})


func object_visible(o: Dictionary) -> bool:
	return cond_ok(o.get("visible"))


func scene_object(id: String) -> Dictionary:
	for o in scene().get("objects", []):
		if o["id"] == id and object_visible(o):
			return o
	return {}


## A thing the player can act on: something in the bag, or a visible object of the scene.
func thing(id: String) -> Dictionary:
	if has_item(id) and items.has(id):
		return items[id]
	return scene_object(id)


func score() -> int:
	var n := 0
	for k in state["points"]:
		n += int(state["points"][k])
	return n


func max_score() -> int:
	var pts := {}
	for sc_id in scenes:
		var rules: Array = scenes[sc_id].get("rules", [])
		for i in rules.size():
			if rules[i].get("points", 0):
				pts[rules[i].get("pointsId", "%s:%d" % [sc_id, i])] = int(rules[i]["points"])
	for i in global_rules.size():
		if global_rules[i].get("points", 0):
			pts[global_rules[i].get("pointsId", "global:%d" % i)] = int(global_rules[i]["points"])
	var n := 0
	for k in pts:
		n += int(pts[k])
	return n


# ---------- rules

## The first rule that answers the action ({} when none). The rule carries "_key", its points key.
func find_rule(verb: String, obj_id: String, item_id: String) -> Dictionary:
	var sc_id: String = state["scene"]
	var candidates: Array = []
	var scene_rules: Array = scene().get("rules", [])
	for i in scene_rules.size():
		candidates.append([scene_rules[i], "%s:%d" % [sc_id, i]])
	for i in global_rules.size():
		candidates.append([global_rules[i], "global:%d" % i])
	for c in candidates:
		var r: Dictionary = c[0]
		if not _list(r.get("verb")).has(verb):
			continue
		var objs := _list(r.get("obj"))
		if objs.size() > 0 and not objs.has(obj_id):
			continue
		var want_item := "" if r.get("item") == null else String(r.get("item"))
		if want_item != "":
			if want_item != item_id:
				continue
		elif item_id != "":
			continue
		if not cond_ok(r.get("when")):
			continue
		var found: Dictionary = r.duplicate()
		found["_key"] = c[1]
		return found
	return {}


func sentence(verb: String, item_id: String, target_name: String) -> String:
	var def := _verb_def(verb)
	var t := String(def.get("label", verb))
	if item_id != "":
		t += " %s %s" % [String(items[item_id]["name"]), String(def.get("link", ""))]
	if target_name != "":
		t += " " + target_name
	return t


func _verb_def(id: String) -> Dictionary:
	for v in base.get("verbs", []):
		if v["id"] == id:
			return v
	return {}


## Does one action. Returns:
##  cmd (the sentence), say (what is said), matched, points (gained), picked_up, goal (new goal id or ""),
##  scene (new scene id or ""), intro (its intro text), fx (effects to play, in order), finished, ending.
func act(verb: String, obj_id: String, item_id: String = "") -> Dictionary:
	var target := thing(obj_id) if obj_id != "" else {}
	var ui: Dictionary = base.get("ui", {})
	var res := {
		"cmd": sentence(verb, item_id, String(target.get("name", ""))), "say": "", "matched": false,
		"points": 0, "picked_up": false, "goal": "", "scene": "", "intro": "", "fx": [],
		"finished": false, "ending": [],
	}
	var bag_before: int = (state["bag"] as Array).size()
	var score_before := score()
	var new_goal := ""
	var new_scene := ""
	var fxs: Array = []
	var finish := false

	if TWO_STEP.has(verb) and item_id == "":
		res["say"] = ui.get("useWhat" if verb == "use" else "giveWhat", "")
	else:
		var rule := find_rule(verb, obj_id, item_id)
		if not rule.is_empty():
			res["matched"] = true
			res["say"] = rule.get("say", "")
			if rule.get("points", 0):
				state["points"][String(rule.get("pointsId", rule["_key"]))] = int(rule["points"])
			var d: Variant = rule.get("do")
			if d is Dictionary:
				for f in _list(d.get("set")):
					state["flags"][f] = true
				for f in _list(d.get("unset")):
					state["flags"].erase(f)
				for i in _list(d.get("add")):
					if not has_item(i):
						(state["bag"] as Array).append(i)
				for i in _list(d.get("remove")):
					state["bag"] = (state["bag"] as Array).filter(func(x): return x != i)
				if d.get("goal") != null and d.get("goal", "") != "" and state["goal"] != d["goal"]:
					state["goal"] = d["goal"]
					new_goal = d["goal"]
				if d.get("go") != null and d.get("go", "") != "":
					new_scene = d["go"]
				if d.get("finish", false):
					finish = true
				for f in _list(d.get("fx")):
					fxs.append(f)
		elif verb == "look" and not target.is_empty() and String(target.get("look", "")) != "":
			res["say"] = target["look"]
		else:
			res["say"] = ui.get("defaults", {}).get(verb, "")

	res["points"] = score() - score_before
	res["picked_up"] = (state["bag"] as Array).size() > bag_before
	res["goal"] = new_goal
	res["fx"] = fxs
	if new_scene != "":
		var from: String = state["scene"]
		state["scene"] = new_scene
		res["scene"] = new_scene
		var sc := scene()
		var seen: bool = state["visited"].has(new_scene)
		res["intro"] = sc.get("introAgain", "") if seen else sc.get("intro", "")
		state["visited"][new_scene] = true
		res["from"] = from
	if finish:
		state["finished"] = true
		res["finished"] = true
		res["ending"] = episode.get("ending", [])
	return res


# ---------- typed commands ("give bread to wolf")

func _known(o: Dictionary, t: String) -> bool:
	var words := _list(o.get("words"))
	return words.has(t) or words.has(t.trim_suffix("s"))


## Returns { verb, a, b } for a command, or { error: "notUnderstood" | "notHere" }.
func parse_typed(input: String) -> Dictionary:
	var re := RegEx.new()
	re.compile("[^a-z\\s]")
	var text := re.sub(input.to_lower(), " ", true)
	var parts := text.split(" ", false)
	text = " ".join(parts)
	var phrases := VERB_PHRASES.duplicate()
	phrases.sort_custom(func(x, y): return String(x[0]).length() > String(y[0]).length())
	var hit: Array = []
	for p in phrases:
		if text == p[0] or text.begins_with(String(p[0]) + " "):
			hit = p
			break
	if hit.is_empty():
		return {"error": "notUnderstood"}
	var rest := text.substr(String(hit[0]).length()).strip_edges()
	var tokens := []
	for t in rest.split(" ", false):
		if not STOP.has(t):
			tokens.append(t)
	var candidates: Array = []
	for id in state["bag"]:
		if items.has(id):
			candidates.append(items[id])
	for o in scene().get("objects", []):
		if object_visible(o):
			candidates.append(o)
	var everything: Array = items.values()
	for sc in scenes.values():
		everything.append_array(sc.get("objects", []))
	var nouns: Array = []
	for t in tokens:
		var found: Dictionary = {}
		for c in candidates:
			if _known(c, t):
				found = c
				break
		if found.is_empty():
			for o in everything:
				if _known(o, t):
					return {"error": "notHere"}
			return {"error": "notUnderstood"}
		if not nouns.has(found["id"]):
			nouns.append(found["id"])
	return {"verb": hit[1], "a": nouns[0] if nouns.size() > 0 else "", "b": nouns[1] if nouns.size() > 1 else ""}


## Turns a parsed command into the call to make: { verb, obj, item } (or {} when nothing fits).
func command_to_action(p: Dictionary) -> Dictionary:
	var v: String = p["verb"]
	var a: String = p["a"]
	var b: String = p["b"]
	if a == "" and v == "look":
		return {"verb": "look", "obj": "", "item": ""}
	if TWO_STEP.has(v) and a != "" and b != "":
		return {"verb": v, "obj": b, "item": a}
	if v == "open" and a != "" and b != "" and has_item(b):
		return {"verb": "use", "obj": a, "item": b}
	if a != "":
		return {"verb": v, "obj": a, "item": ""}
	return {}


# ---------- hints

## First time: the English hint. After that: the Hebrew goal and hint.
func hint() -> Dictionary:
	var g: Dictionary = goals.get(state["goal"], {})
	var level: int = int(state["hints"].get(state["goal"], 0))
	state["hints"][state["goal"]] = level + 1
	if level == 0:
		return {"kind": "hint", "text": g.get("hint", "")}
	return {"kind": "he", "text": "%s %s" % [g.get("he", ""), g.get("hintHe", "")]}
