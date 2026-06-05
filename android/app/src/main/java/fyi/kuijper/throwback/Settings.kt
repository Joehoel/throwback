package fyi.kuijper.throwback

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Snapshot of the settings the UI/engine follows reactively. */
data class SettingsSnapshot(
    val slideSeconds: Int,
    val shuffle: Boolean,
    val captionEnabled: Boolean,
    val surfaceRenderer: Boolean,
)

/**
 * App settings for the slideshow. Persisted in SharedPreferences, but also exposed as [state]
 * ([StateFlow]) so a change lands directly in the combined [UiState] without manual copying.
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
        surfaceRenderer = prefs.getBoolean("surface_renderer", false),
    )

    /** Seconds per photo (clamped 3–30). */
    var slideSeconds: Int
        get() = _state.value.slideSeconds
        set(value) {
            val clamped = value.coerceIn(3, 30)
            prefs.edit().putInt("slide_seconds", clamped).apply()
            _state.value = _state.value.copy(slideSeconds = clamped)
        }

    /** True = shuffle, false = chronological. */
    var shuffle: Boolean
        get() = _state.value.shuffle
        set(value) {
            prefs.edit().putBoolean("shuffle", value).apply()
            _state.value = _state.value.copy(shuffle = value)
        }

    var captionEnabled: Boolean
        get() = _state.value.captionEnabled
        set(value) {
            prefs.edit().putBoolean("caption_enabled", value).apply()
            _state.value = _state.value.copy(captionEnabled = value)
        }

    /**
     * Experimental: render the show through the native-resolution [SurfaceView] path
     * ([ui.surface.Surface4kCanvas]) instead of the Compose renderer. Off by default; lets the 4K path
     * be tried on real hardware without a rebuild. See branch explore/surfaceview-4k.
     */
    var surfaceRenderer: Boolean
        get() = _state.value.surfaceRenderer
        set(value) {
            prefs.edit().putBoolean("surface_renderer", value).apply()
            _state.value = _state.value.copy(surfaceRenderer = value)
        }

    /** Whether the one-time "set as screensaver" hint has been shown. (No reactivity needed.) */
    var screensaverHintShown: Boolean
        get() = prefs.getBoolean("screensaver_hint_shown", false)
        set(value) { prefs.edit().putBoolean("screensaver_hint_shown", value).apply() }
}
