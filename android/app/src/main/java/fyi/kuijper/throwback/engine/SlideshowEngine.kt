package fyi.kuijper.throwback.engine

import android.content.Context
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import fyi.kuijper.throwback.Telemetry
import fyi.kuijper.throwback.db.PhotoDao
import fyi.kuijper.throwback.onedrive.GraphMedia
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.player.PhotoOrder
import fyi.kuijper.throwback.player.Playlist
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import kotlin.random.Random

/**
 * The running slideshow: owns the playlist, timer loop, pause state and thumbnail/prefetch cache.
 * One instance per process (see AppContainer) so the Activity and the screensaver share the same
 * running show. State the UI needs is exposed as a [StateFlow].
 *
 * [slideSeconds] is re-read per slide, so a changed setting takes effect immediately.
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

    // One Sentry event per outage, not one per slide: set when a non-network thumbnail failure is
    // reported, cleared by the next reachable fetch (see onThumbnailFailure).
    private var thumbnailFailureReported = false

    // Stable thumbnail URL per photo, so prefetch and display share the same URL (= Coil cache key).
    // Concurrent: the loop and the parallel prefetch both touch it, on a multi-threaded scope.
    private val urlCache = ConcurrentHashMap<String, String>()

    val hasPlaylist: Boolean get() = playlist != null

    fun start(photos: List<PhotoRow>, shuffle: Boolean) {
        playlist = if (shuffle) {
            // Folder key per photo so the bag can space photos from the same folder apart (a big
            // folder otherwise clumps, since the draw is uniform over photos, not folders).
            val folderByPhoto = HashMap<String, String>(photos.size)
            for (p in photos) folderByPhoto[p.id] = p.path
            Playlist.shuffled(photos.map { it.id }, Random.Default) { folderByPhoto[it] }
        } else {
            Playlist.ordered(PhotoOrder.chronological(photos))
        }
        paused = false
        runLoop()
    }

    /** Resume the existing loop (e.g. after settings) without disturbing the position. */
    fun resume() {
        if (playlist != null) runLoop()
    }

    /** Pause only the loop; rendering stays on the current photo. */
    fun stop() {
        loopJob?.cancel()
    }

    fun appendIds(ids: List<String>) {
        playlist?.append(ids)
    }

    /** Removes photos from the running show; shows a valid photo at once if the current one is gone. */
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
        // Expired link or network blip: don't hard-stop — show the hint and keep going.
        // Cancellation (the slide advanced before the fetch finished) is normal flow, not worth a crumb.
        val url = try {
            urlFor(id).also { thumbnailFailureReported = false }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            onThumbnailFailure(e)
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

    /**
     * A handled thumbnail failure: always a breadcrumb (context for later events), and — unless it is a
     * plain loss of connectivity — a Sentry event. A dropped network is the expected, self-healing case
     * the offline hint already covers; reporting it would fire an event every slide while the TV is off
     * Wi-Fi. Anything else means Graph *answered* with an error (a malformed request, a server fault, an
     * unparseable body) — a real problem worth seeing, like the custom-thumbnail path bug that otherwise
     * broke every photo in silence. Captured once per outage (re-armed by the next reachable fetch) so a
     * systemic failure is one issue, not one per slide.
     */
    private fun onThumbnailFailure(e: Exception) {
        Telemetry.breadcrumb("thumbnail fetch failed: ${e.message}", "slideshow")
        if (e is IOException) return
        if (!thumbnailFailureReported) {
            thumbnailFailureReported = true
            Telemetry.captureHandled(e, "slideshow.thumbnail")
        }
    }

    private suspend fun urlFor(id: String): String? =
        urlCache[id] ?: media.thumbnailUrl(id)?.also {
            if (urlCache.size > MAX_CACHED_URLS) urlCache.clear()
            urlCache[id] = it
        }

    /** Warm the neighbours of the current photo into Coil's cache, so switching is instant. */
    private fun prefetch() {
        val ids = playlist?.window(ahead = 3, behind = 1) ?: return
        scope.launch {
            val loader = SingletonImageLoader.get(appContext)
            val urls = ids.map { id -> async { runCatching { urlFor(id) }.getOrNull() } }.awaitAll()
            for (url in urls.filterNotNull()) {
                loader.enqueue(ImageRequest.Builder(appContext).data(url).build())
            }
        }
    }

    private companion object {
        // Evict the whole thumbnail-URL cache past this size; URLs are cheap to re-fetch.
        const val MAX_CACHED_URLS = 2000
    }
}
