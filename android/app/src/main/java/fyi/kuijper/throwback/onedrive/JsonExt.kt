package fyi.kuijper.throwback.onedrive

import org.json.JSONObject

/** Trimmed string at [key], or null when absent or blank. */
fun JSONObject.optStringOrNull(key: String): String? = optString(key).ifBlank { null }

/** The JSON objects in the array at [key] (empty when the key is absent). */
fun JSONObject.objects(key: String): List<JSONObject> =
    optJSONArray(key)?.let { arr -> List(arr.length()) { arr.getJSONObject(it) } } ?: emptyList()
