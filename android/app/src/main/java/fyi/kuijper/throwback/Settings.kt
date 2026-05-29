package fyi.kuijper.throwback

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Momentopname van de instellingen die de UI/engine reactief volgt. */
data class SettingsSnapshot(
    val slideSeconds: Int,
    val shuffle: Boolean,
    val captionEnabled: Boolean,
)

/**
 * App-instellingen voor de slideshow (tempo + volgorde + bijschrift). Persistent in
 * SharedPreferences, maar ook als [state] ([StateFlow]) zodat een wijziging direct in de
 * gecombineerde [UiState] terechtkomt zonder handmatig kopiëren.
 */
class Settings(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("throwback_settings", Context.MODE_PRIVATE)

    private val _state = MutableStateFlow(read())
    val state: StateFlow<SettingsSnapshot> = _state.asStateFlow()

    private fun read() = SettingsSnapshot(
        slideSeconds = prefs.getInt("slide_seconds", 8),
        shuffle = prefs.getBoolean("shuffle", true),
        captionEnabled = prefs.getBoolean("caption_enabled", true),
    )

    /** Seconden per foto (3–30). */
    var slideSeconds: Int
        get() = _state.value.slideSeconds
        set(value) {
            prefs.edit().putInt("slide_seconds", value.coerceIn(3, 30)).apply()
            _state.value = read()
        }

    /** True = shuffle, false = chronologisch. */
    var shuffle: Boolean
        get() = _state.value.shuffle
        set(value) {
            prefs.edit().putBoolean("shuffle", value).apply()
            _state.value = read()
        }

    /** Bijschrift (datum/gebeurtenis) subtiel in beeld tonen. */
    var captionEnabled: Boolean
        get() = _state.value.captionEnabled
        set(value) {
            prefs.edit().putBoolean("caption_enabled", value).apply()
            _state.value = read()
        }

    /** Of de eenmalige "stel in als screensaver"-hint al getoond is. (Niet reactief nodig.) */
    var screensaverHintShown: Boolean
        get() = prefs.getBoolean("screensaver_hint_shown", false)
        set(value) { prefs.edit().putBoolean("screensaver_hint_shown", value).apply() }
}
