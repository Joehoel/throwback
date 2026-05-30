package fyi.kuijper.throwback

import android.app.Application

/** Owns the process-wide [AppContainer], shared by the Activity and the screensaver. */
class ThrowbackApp : Application() {
    val container: AppContainer by lazy { AppContainer(this) }
}
