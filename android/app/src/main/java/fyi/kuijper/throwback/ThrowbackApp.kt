package fyi.kuijper.throwback

import android.app.Application

/** Bezit de proces-brede [AppContainer], gedeeld door de Activity en de screensaver. */
class ThrowbackApp : Application() {
    val container: AppContainer by lazy { AppContainer(this) }
}
