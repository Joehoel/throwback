package fyi.kuijper.throwback

import android.service.dreams.DreamService
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.ComposeView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import fyi.kuijper.throwback.ui.ConnectFlow
import fyi.kuijper.throwback.ui.theme.ThrowbackTheme

/**
 * Throwback als screensaver (ADR-0003: aangeboden, niet vereist). Host dezelfde
 * Compose-UI als de app; start de show automatisch zodra er een geïndexeerde map is.
 * DreamService is geen Activity, dus we leveren zelf de lifecycle/viewmodel/savedstate-owners.
 */
class ThrowbackDreamService :
    DreamService(),
    LifecycleOwner,
    ViewModelStoreOwner,
    SavedStateRegistryOwner {

    private val lifecycleRegistry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = lifecycleRegistry

    override val viewModelStore = ViewModelStore()

    private val savedStateController = SavedStateRegistryController.create(this)
    override val savedStateRegistry: SavedStateRegistry get() = savedStateController.savedStateRegistry

    override fun onCreate() {
        super.onCreate()
        savedStateController.performAttach()
        savedStateController.performRestore(null)
        lifecycleRegistry.currentState = Lifecycle.State.CREATED
    }

    @OptIn(ExperimentalTvMaterial3Api::class)
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = true // D-pad (vooruit/terug/pauze) blijft werken
        isFullscreen = true

        val composeView = ComposeView(this).apply {
            setViewTreeLifecycleOwner(this@ThrowbackDreamService)
            setViewTreeViewModelStoreOwner(this@ThrowbackDreamService)
            setViewTreeSavedStateRegistryOwner(this@ThrowbackDreamService)
            setContent {
                ThrowbackTheme {
                    Surface(modifier = Modifier.fillMaxSize(), shape = RectangleShape) {
                        val vm: MainViewModel = viewModel(
                            factory = ViewModelProvider.AndroidViewModelFactory.getInstance(application),
                        )
                        val state by vm.state.collectAsState()
                        LaunchedEffect(state) {
                            val ready = state as? UiState.Ready
                            if (ready != null && ready.indexed > 0) vm.startShow()
                        }
                        ConnectFlow(state, vm)
                    }
                }
            }
        }
        setContentView(composeView)
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        lifecycleRegistry.currentState = Lifecycle.State.RESUMED
    }

    override fun onDreamingStopped() {
        super.onDreamingStopped()
        lifecycleRegistry.currentState = Lifecycle.State.CREATED
    }

    override fun onDetachedFromWindow() {
        lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
        viewModelStore.clear()
        super.onDetachedFromWindow()
    }
}
