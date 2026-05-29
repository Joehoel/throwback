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
        // Heeft dit toestel überhaupt een screensaver-instellingenpagina? (Emulators/sommige
        // TV-flavors niet.) Zo niet: knop verbergen en de hint overslaan.
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

                    // Eenmalige hint ná setup (zodra geconfigureerd), één keer, vóór de show.
                    // Alleen als het toestel screensavers kan instellen.
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
     * Open de screensaver/daydream-instelling. Op Android TV is er geen gegarandeerde deeplink,
     * dus we proberen meerdere kandidaten en vallen terug op de algemene instellingen. We gebruiken
     * GEEN resolveActivity-check: door package-visibility (Android 11+) geeft die vaak null terug
     * ook voor instellingen die wél bestaan, waardoor de knop niets zou doen. startActivity met
     * try/catch werkt wel — de laatste kandidaat (algemene instellingen) opent vrijwel altijd.
     */
    private fun openScreensaverSettings() {
        // Let op: alleen intents die óf de juiste pagina openen óf netjes een exceptie gooien.
        // Een expliciete component (bv. com.android.tv.settings/...DaydreamActivity) "slaagt" op
        // sommige Google TV-flavors zonder iets te tonen ("Activity is not supported in current
        // flavor") en zou de werkende fallback maskeren — die laten we dus weg.
        val candidates = listOf(
            Intent("android.settings.DREAM_SETTINGS"),
            Intent(android.provider.Settings.ACTION_SETTINGS),
        )
        for (intent in candidates) {
            try {
                startActivity(intent)
                return
            } catch (_: Exception) {
                // niet beschikbaar op dit toestel → probeer de volgende
            }
        }
    }
}
