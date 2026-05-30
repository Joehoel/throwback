package fyi.kuijper.throwback

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import fyi.kuijper.throwback.ui.ConnectFlow
import fyi.kuijper.throwback.ui.screens.ScreensaverHintScreen
import fyi.kuijper.throwback.ui.theme.ThrowbackTheme

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalTvMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appSettings = (application as ThrowbackApp).container.settings
        // Does this device even have a screensaver settings page? (Emulators / some TV flavors don't.)
        // If not: hide the button and skip the hint.
        val screensaverConfigurable = Intent("android.settings.DREAM_SETTINGS")
            .resolveActivity(packageManager) != null
        setContent {
            ThrowbackTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    shape = RectangleShape,
                ) {
                    val vm: MainViewModel = viewModel()
                    val state by vm.state.collectAsState()
                    var showHint by remember { mutableStateOf(!appSettings.screensaverHintShown) }

                    // One-time hint after setup, before the show, only if the device can configure screensavers.
                    val configured = state is UiState.Show || state is UiState.Preparing
                    if (showHint && configured && screensaverConfigurable) {
                        ScreensaverHintScreen(
                            onOpenSettings = {
                                appSettings.screensaverHintShown = true
                                showHint = false
                                openScreensaverSettings()
                            },
                            onLater = {
                                appSettings.screensaverHintShown = true
                                showHint = false
                            },
                        )
                    } else {
                        ConnectFlow(
                            state = state,
                            vm = vm,
                            onExitApp = { finish() },
                            onOpenScreensaverSettings = ::openScreensaverSettings,
                            screensaverConfigurable = screensaverConfigurable,
                        )
                    }
                }
            }
        }
    }

    /**
     * Open the screensaver/daydream setting. Android TV has no guaranteed deeplink, so we try several
     * candidates and fall back to general settings. We deliberately do NOT use a resolveActivity check:
     * under package visibility (Android 11+) it often returns null even for settings that do exist,
     * which would make the button do nothing. startActivity with try/catch works — the last candidate
     * (general settings) almost always opens.
     */
    private fun openScreensaverSettings() {
        // Only intents that either open the right page or throw cleanly. An explicit component (e.g.
        // com.android.tv.settings/...DaydreamActivity) "succeeds" on some Google TV flavors without
        // showing anything ("Activity is not supported in current flavor") and would mask the working
        // fallback — so we leave it out.
        val candidates = listOf(
            Intent("android.settings.DREAM_SETTINGS"),
            Intent(android.provider.Settings.ACTION_SETTINGS),
        )
        for (intent in candidates) {
            try {
                startActivity(intent)
                return
            } catch (_: Exception) {
                // not available on this device → try the next
            }
        }
    }
}
