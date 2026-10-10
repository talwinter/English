extends SceneTree
## Headless check of the word store: states, practice questions, saving.
##   godot --headless --path godot --script res://scripts/test_words.gd

func _init() -> void:
	var fails := [0]
	var check := func(label: String, ok: bool) -> void:
		print(("ok   " if ok else "FAIL ") + label)
		if not ok:
			fails[0] += 1
	var s := WordStore.new()
	s.function_words = {"the": true, "a": true}
	var dict := {"cable": "כבל", "disk": "דיסקט", "box": "קופסה", "old": "ישן", "moon": "ירח", "the": "ה", "desk": "שולחן"}
	s.mark_seen_text("The old box and the cable. A disk on the desk. The moon.")
	check.call("function words are not met words", not s.met_words(dict).has("the"))
	check.call("content words are met", s.met_words(dict).size() == 6)
	check.call("a seen word is NEW", s.state("cable") == WordStore.State.NEW)
	s.looked("cable")
	check.call("clicked word is LEARNING", s.state("cable") == WordStore.State.LEARNING)
	s.answer("cable", true)
	s.answer("cable", true)
	s.answer("cable", true)
	check.call("3 right answers = MASTERED", s.state("cable") == WordStore.State.MASTERED)
	s.answer("cable", false)
	check.call("a wrong answer sends it back", s.state("cable") != WordStore.State.MASTERED)
	s.mark_known("moon")
	check.call("'I know it' = MASTERED", s.state("moon") == WordStore.State.MASTERED)
	var c := s.counts(dict)
	check.call("counts add up", int(c["met"]) == int(c["new"]) + int(c["learning"]) + int(c["mastered"]))
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var q := s.make_quiz(dict, 5, rng)
	check.call("quiz has questions", q.size() >= 4)
	var ok := true
	for item in q:
		ok = ok and item["options"].size() == 3 and item["options"][item["answer"]] == dict[item["word"]]
		ok = ok and (item["options"] as Array).size() == (item["options"] as Array).filter(func(x): return true).size()
	check.call("every question has its right answer among 3 options", ok)
	s.save_file("user://words_test.json")
	var s2 := WordStore.new()
	s2.load_file("user://words_test.json")
	check.call("saved and loaded", s2.state("moon") == WordStore.State.MASTERED)
	print("WORD TEST: ", ("FAILED (%d)" % fails[0]) if fails[0] > 0 else "all ok")
	quit(1 if fails[0] > 0 else 0)
