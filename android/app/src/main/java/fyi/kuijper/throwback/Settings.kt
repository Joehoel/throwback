package fyi.kuijper.throwback

import android.content.Context

/** App-instellingen voor de slideshow (tempo + volgorde). */
class Settings(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("throwback_settings", Context.MODE_PRIVATE)

    /** Seconden per foto (3–30). */
    var slideSeconds: Int
        get() = prefs.getInt("slide_seconds", 8)
        set(value) { prefs.edit().putInt("slide_seconds", value.coerceIn(3, 30)).apply() }

    /** True = shuffle, false = chronologisch. */
    var shuffle: Boolean
        get() = prefs.getBoolean("shuffle", true)
        set(value) { prefs.edit().putBoolean("shuffle", value).apply() }
}
