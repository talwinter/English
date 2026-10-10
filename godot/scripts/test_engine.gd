extends SceneTree
## Headless check of the rule engine: plays the prologue like the server's robot would.
##   godot --headless --path godot --script res://scripts/test_engine.gd

func _init() -> void:
	var base_file := FileAccess.open("res://episodes/_base.json", FileAccess.READ)
	var base: Dictionary = JSON.parse_string(base_file.get_as_text())["base"]
	var ep_file := FileAccess.open("res://episodes/s1e0.json", FileAccess.READ)
	var ep: Dictionary = JSON.parse_string(ep_file.get_as_text())
	var e := EpisodeEngine.new()
	e.load_episode(ep, base)
	var fails := [0]
	var check := func(label: String, ok: bool) -> void:
		print(("ok   " if ok else "FAIL ") + label)
		if not ok:
			fails[0] += 1

	var r := e.act("look", "computer")
	check.call("look computer (off) says it is off", String(r["say"]).contains("off"))
	check.call("  gives 5 points and goal cable", r["points"] == 5 and r["goal"] == "cable")
	check.call("cable is not visible before the box is open", e.scene_object("cable").is_empty())
	r = e.act("open", "box")
	check.call("open box", String(r["say"]).contains("cable and a disk"))
	check.call("cable now visible", not e.scene_object("cable").is_empty())
	r = e.act("take", "cable")
	check.call("take cable", r["picked_up"] and e.has_item("cable"))
	r = e.act("take", "disk")
	check.call("take disk", r["picked_up"] and e.has_item("disk"))
	r = e.act("use", "computer", "disk")
	check.call("disk before power: 'First you need the cable'", String(r["say"]).contains("cable"))
	r = e.act("use", "computer", "cable")
	check.call("cable on computer turns it on with crt+boot", r["fx"] == ["crt", "boot"] and e.flag("computerOn"))
	r = e.act("use", "keyboard", "disk")
	check.call("disk in: glitch", r["fx"] == ["glitch"] and e.flag("diskIn"))
	r = e.act("talk", "computer")
	check.call("talk: askname, glitch, pullin and finish", r["fx"] == ["askname", "glitch", "pullin"] and r["finished"])
	check.call("ending has 7 lines", (r["ending"] as Array).size() == 7)
	check.call("score is the max", e.score() == e.max_score() and e.score() > 0)
	print("score ", e.score(), "/", e.max_score())

	var e2 := EpisodeEngine.new()
	e2.load_episode(ep, base)
	var p := e2.parse_typed("open the box")
	check.call("typed: open the box", p.get("verb") == "open" and p.get("a") == "box")
	p = e2.parse_typed("take cable")
	check.call("typed: cable is not here yet", p.get("error") == "notHere" or p.get("error") == "notUnderstood")
	p = e2.parse_typed("dance wildly")
	check.call("typed: not understood", p.get("error") == "notUnderstood")
	e2.act("open", "box")
	e2.act("take", "cable")
	p = e2.parse_typed("use cable on computer")
	var a := e2.command_to_action(p)
	check.call("typed: use cable on computer", a.get("verb") == "use" and a.get("obj") == "computer" and a.get("item") == "cable")

	print("ENGINE TEST: ", ("FAILED (%d)" % fails[0]) if fails[0] > 0 else "all ok")
	quit(1 if fails[0] > 0 else 0)
