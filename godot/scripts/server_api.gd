class_name ServerApi
extends Node
## Talks to the English Quest server. Every call returns { ok, code, data }; nothing here throws, so the
## game keeps working when the server is away.

var base := ""
var timeout := 8.0


func enabled() -> bool:
	return base != ""


func get_json(path: String) -> Dictionary:
	return await _call(path, HTTPClient.METHOD_GET, null)


func post_json(path: String, body: Dictionary) -> Dictionary:
	return await _call(path, HTTPClient.METHOD_POST, body)


func _call(path: String, method: int, body: Variant) -> Dictionary:
	if base == "":
		return {"ok": false, "code": 0, "data": {}}
	var http := HTTPRequest.new()
	http.timeout = timeout
	add_child(http)
	var headers := PackedStringArray(["Content-Type: application/json"])
	var payload := JSON.stringify(body) if body != null else ""
	var err := http.request(base + path, headers, method, payload)
	if err != OK:
		http.queue_free()
		return {"ok": false, "code": 0, "data": {}}
	var res: Array = await http.request_completed
	http.queue_free()
	var text := (res[3] as PackedByteArray).get_string_from_utf8().strip_edges()
	var data: Variant = JSON.parse_string(text) if text.begins_with("{") else null    # an old server answers plain text
	return {"ok": res[0] == HTTPRequest.RESULT_SUCCESS and int(res[1]) >= 200 and int(res[1]) < 300,
		"code": int(res[1]), "data": data if data is Dictionary else {}}
