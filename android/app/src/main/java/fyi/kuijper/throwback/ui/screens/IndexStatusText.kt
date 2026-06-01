package fyi.kuijper.throwback.ui.screens

import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.core.AppLocale

private fun fmt(n: Int) = String.format(AppLocale, "%,d", n)

/**
 * First status line under the Settings title. While indexing, shows this run's progress against the
 * folder total ("processed / total foto's") — which works on a re-crawl too, where every photo is
 * already in the index. When idle, shows the indexed count. Null when there is nothing to report.
 * Pure, so the branch logic is unit-testable without Compose.
 */
fun indexStatusText(state: UiState.Settings): String? {
    if (state.indexed == 0 && !state.indexing) return null
    val count = fmt(state.indexed)
    return when {
        state.indexing && state.processed > 0 && state.total > 0 ->
            "Indexeren… ${fmt(state.processed)} / ${fmt(state.total)} foto's"
        state.indexing -> "Bibliotheek bijwerken…"
        state.syncError != null -> "$count foto's · laatste verversing mislukt"
        else -> "$count foto's geïndexeerd"
    }
}

/**
 * Second status line: reverse-geocoding progress ("G van Z met locatie"). Geocoding is decoupled from
 * indexing (ADR-0004), so it gets its own line. Null when no photo in the folder carries GPS — there is
 * then nothing to locate, so a 0/0 row would only confuse.
 */
fun geocodeStatusText(state: UiState.Settings): String? {
    if (state.located == 0) return null
    return "${fmt(state.geocoded)} van ${fmt(state.located)} met locatie"
}
