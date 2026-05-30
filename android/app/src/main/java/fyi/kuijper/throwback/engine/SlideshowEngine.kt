package fyi.kuijper.throwback.engine

import android.content.Context
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import fyi.kuijper.throwback.db.PhotoDao
import fyi.kuijper.throwback.onedrive.GraphMedia
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.player.PhotoOrder
import fyi.kuijper.throwback.player.Playlist
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.random.Random

/**
 * De doorlopende slideshow: bezit de afspeellijst, de timer-lus, de pauze-stand en de
 * thumbnail-/prefetch-cache. Eén instantie per proces (zie AppContainer) zodat de app-Activity
 * en de screensaver dezelfde lopende show delen. Geen FSM — een slideshow is een coroutine-lus,
 * geen discrete-event automaat — maar de toestand die de UI nodig heeft komt als [StateFlow].
 *
 * [slideSeconds] wordt per slide opnieuw gelezen, zodat een gewijzigde instelling direct meetelt.
 */
class SlideshowEngine(
    private val appContext: Context,
    private val db: PhotoDao,
    private val media: GraphMedia,
    private val scope: CoroutineScope,
    private val slideSeconds: () -> Int,
) {
    data class State(
        val photo: PhotoRow? = null,
        val imageUrl: String? = null,
        val paused: Boolean = false,
        val offlineHint: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var playlist: Playlist? = null
    private var loopJob: Job? = null
    private var paused = false

    // Stabiele thumbnail-URL per foto, zodat prefetch en weergave dezelfde URL (= Coil-cachesleutel) delen.
    private val urlCache = HashMap<String, String>()

    val hasPlaylist: Boolean get() = playlist != null

    /** Bouw een verse afspeellijst uit [photos] en start de lus. */
    fun start(photos: List<PhotoRow>, shuffle: Boolean) {
        playlist = if (shuffle) {
            Playlist.shuffled(photos.map { it.id }, Random.Default)
        } else {
            Playlist.ordered(PhotoOrder.chronological(photos))
        }
        paused = false
        runLoop()
    }

    /** Hervat de bestaande lus (bv. na instellingen) zonder de positie te verstoren. */
    fun resume() {
        if (playlist != null) runLoop()
    }

    /** Pauzeer alleen de lus (rendering blijft staan op de huidige foto). */
    fun stop() {
        loopJob?.cancel()
    }

    /** Voeg nieuw geïndexeerde foto's toe aan de lopende show (achtergrond-verversing). */
    fun appendIds(ids: List<String>) {
        playlist?.append(ids)
    }

    /** Verwijder foto's uit de lopende show; toont meteen een geldige foto als de huidige wegviel. */
    fun removeIds(ids: List<String>) {
        if (ids.isEmpty() || playlist == null) return
        val removingCurrent = _state.value.photo?.id in ids
        playlist?.remove(ids)
        if (removingCurrent) runLoop()
    }

    fun next() {
        playlist?.next()
        runLoop()
    }

    fun previous() {
        playlist?.previous()
        runLoop()
    }

    fun togglePause() {
        paused = !paused
        _state.value = _state.value.copy(paused = paused)
    }

    /** Volledig leegmaken (andere map / loskoppelen). */
    fun reset() {
        loopJob?.cancel()
        playlist = null
        urlCache.clear()
        _state.value = State()
    }

    private fun runLoop() {
        loopJob?.cancel()
        loopJob = scope.launch {
            showCurrent()
            while (isActive) {
                delay(slideSeconds() * 1000L)
                if (paused) continue
                playlist?.next()
                showCurrent()
            }
        }
    }

    private suspend fun showCurrent() {
        val id = playlist?.current ?: return
        val photo = db.get(id)
        // Verlopen koppeling of netwerkblip: niet hard stoppen — toon het hintje en draai door.
        val url = try {
            urlFor(id)
        } catch (e: Exception) {
            null
        }
        _state.value = State(
            photo = photo,
            imageUrl = url,
            paused = paused,
            offlineHint = url == null,
        )
        prefetch()
    }

    private suspend fun urlFor(id: String): String? =
        urlCache[id] ?: media.thumbnailUrl(id)?.also {
            if (urlCache.size > 2000) urlCache.clear()
            urlCache[id] = it
        }

    /** Warm de buren rondom de huidige foto in Coil's cache, zodat wisselen direct is. */
    private fun prefetch() {
        val ids = playlist?.window(ahead = 3, behind = 1) ?: return
        scope.launch {
            val loader = SingletonImageLoader.get(appContext)
            for (id in ids) {
                val url = runCatching { urlFor(id) }.getOrNull() ?: continue
                loader.enqueue(ImageRequest.Builder(appContext).data(url).build())
            }
        }
    }
}
