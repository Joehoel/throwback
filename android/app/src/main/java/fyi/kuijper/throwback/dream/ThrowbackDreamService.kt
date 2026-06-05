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
import fyi.kuijper.throwback.ui.screens.SlideshowCanvas
import fyi.kuijper.throwback.ui.surface.Surface4kCanvas
import fyi.kuijper.throwback.ui.theme.ThrowbackTheme

/**
 * System screensaver: reuses the same slideshow rendering ([SlideshowCanvas]) and ViewModel logic as
 * the app. Compose outside an Activity requires us to supply the lifecycle/viewmodel/savedstate owners
 * ourselves.
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
                        is UiState.Show -> if (s.surfaceRenderer) {
                            Surface4kCanvas(
                                imageUrl = s.imageUrl,
                                photo = s.photo,
                                captionEnabled = s.captionEnabled,
                                offlineHint = s.offlineHint,
                                paused = false,
                            )
                        } else {
                            SlideshowCanvas(
                                imageUrl = s.imageUrl,
                                photo = s.photo,
                                captionEnabled = s.captionEnabled,
                                offlineHint = s.offlineHint,
                                paused = false,
                            )
                        }
                        // Not yet showing (connecting / preparing the index): just black.
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
