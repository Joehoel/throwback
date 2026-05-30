package fyi.kuijper.throwback.onedrive

/** Trimmed string, or null when it is null/blank. */
fun String?.trimToNull(): String? = this?.trim()?.ifBlank { null }
