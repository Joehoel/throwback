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
        val appSettings = Settings(applicationContext)
        setContent {
            ThrowbackTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    shape = RectangleShape,
                ) {
                    val vm: MainViewModel = viewModel()
                    val state by vm.state.collectAsState()
                    var showHint by remember { mutableStateOf(!appSettings.screensaverHintShown) }

                    // Eenmalige hint ná setup (zodra geconfigureerd), één keer, vóór de show.
                    val configured = state is UiState.Show || state is UiState.Preparing
                    if (showHint && configured) {
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
                        )
                    }
                }
            }
        }
    }

    /** Open de screensaver/daydream-instelling van het systeem; val terug op de algemene instellingen. */
    private fun openScreensaverSettings() {
        val candidates = listOf(
            Intent("android.settings.DREAM_SETTINGS"),
            Intent(android.provider.Settings.ACTION_SETTINGS),
        )
        for (intent in candidates) {
            try {
                startActivity(intent)
                return
            } catch (_: Exception) {
                // probeer de volgende
            }
        }
    }
}
