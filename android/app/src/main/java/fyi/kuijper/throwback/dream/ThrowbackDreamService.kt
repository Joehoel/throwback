package fyi.kuijper.throwback.dream

import android.service.dreams.DreamService
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import fyi.kuijper.throwback.MainViewModel
import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.ui.screens.PreparingScreen
import fyi.kuijper.throwback.ui.screens.SlideshowCanvas
import fyi.kuijper.throwback.ui.theme.ThrowbackTheme

/**
 * Systeem-screensaver: hergebruikt dezelfde slideshow-rendering ([SlideshowCanvas]) en
 * ViewModel-logica als de app. Niet-interactief — de show draait vanzelf en stopt bij input.
 * Compose buiten een Activity vereist dat we zelf de lifecycle-/viewmodel-/savedstate-owners leveren.
 */
class ThrowbackDreamService : DreamService(), LifecycleOwner, ViewModelStoreOwner, SavedStateRegistryOwner {

    private val lifecycleRegistry = LifecycleRegistry(this)
    private val store = ViewModelStore()
    private val savedStateController = SavedStateRegistryController.create(this)

    override val lifecycle: Lifecycle get() = lifecycleRegistry
    override val viewModelStore: ViewModelStore get() = store
    override val savedStateRegistry get() = savedStateController.savedStateRegistry

    override fun onCreate() {
        super.onCreate()
        savedStateController.performRestore(null)
        lifecycleRegistry.currentState = Lifecycle.State.CREATED
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false
        isFullscreen = true
        isScreenBright = true
        lifecycleRegistry.currentState = Lifecycle.State.RESUMED

        val view = ComposeView(this).apply {
            setViewTreeLifecycleOwner(this@ThrowbackDreamService)
            setViewTreeViewModelStoreOwner(this@ThrowbackDreamService)
            setViewTreeSavedStateRegistryOwner(this@ThrowbackDreamService)
            setContent {
                ThrowbackTheme {
                    val vm: MainViewModel = viewModel(
                        factory = ViewModelProvider.AndroidViewModelFactory.getInstance(application),
                    )
                    val state by vm.state.collectAsState()
                    when (val s = state) {
                        is UiState.Show -> SlideshowCanvas(
                            imageUrl = s.imageUrl,
                            photo = s.photo,
                            captionEnabled = s.captionEnabled,
                            offlineHint = s.offlineHint,
                            paused = false,
                        )
                        is UiState.Preparing -> PreparingScreen(s)
                        // Niet geconfigureerd / koppelscherm: gewoon zwart in de screensaver.
                        else -> Box(Modifier.fillMaxSize().background(Color.Black))
                    }
                }
            }
        }
        setContentView(view)
    }

    override fun onDetachedFromWindow() {
        lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
        store.clear()
        super.onDetachedFromWindow()
    }
}
