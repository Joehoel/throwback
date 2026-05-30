package fyi.kuijper.throwback.ui.screens

import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.core.AppLocale

/**
 * The status line under the Settings title: how many photos are indexed and whether a sync is running.
 * Null when there is nothing to report. Pure, so the branch logic is unit-testable without Compose.
 */
fun indexStatusText(state: UiState.Settings): String? {
    if (state.indexed == 0 && !state.indexing) return null
    fun fmt(n: Int) = String.format(AppLocale, "%,d", n)
    val count = fmt(state.indexed)
    return when {
        state.indexing && state.processed > 0 && state.indexed > state.processed ->
            "Indexeren… ${fmt(state.processed)} / $count foto's"
        state.indexing && state.processed > 0 -> "Indexeren… ${fmt(state.processed)} foto's"
        state.indexing -> "Bibliotheek bijwerken…"
        state.syncError != null -> "$count foto's · laatste verversing mislukt"
        else -> "$count foto's geïndexeerd"
    }
}
