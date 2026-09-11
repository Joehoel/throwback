package fyi.kuijper.throwback.ui.surface

/**
 * A self-paced background render loop: [start] spins up one thread that calls [frame] roughly every
 * [frameMs], and [stop] tears it down. Its whole reason to exist is the [stop] contract — see below.
 *
 * The point is the shutdown guarantee a [android.view.SurfaceView] demands: once `surfaceDestroyed`
 * returns, the surface is gone and touching its canvas aborts the process natively (a SIGABRT on the
 * graphics buffer, uncatchable in Kotlin). So [stop] must BLOCK until any frame already in flight has
 * finished and guarantee no further [frame] runs after it returns — the caller can then let the surface
 * go knowing nothing will draw into it again.
 *
 * Pure JVM (no Android types) so the lifecycle contract is unit-testable; the frame body does its own
 * Android drawing. [start]/[stop] are called from one thread (the surface callbacks, i.e. the main one).
 */
class RenderLoop(private val frameMs: Long) {

    @Volatile private var running = false
    private var thread: Thread? = null

    fun start(frame: () -> Unit) {
        if (running) return // surfaceCreated can fire twice; keep a single loop, never orphan a thread
        running = true
        thread = Thread {
            while (running) {
                frame()
                Thread.sleep(frameMs)
            }
        }.also { it.name = "photo-surface-render"; it.start() }
    }

    fun stop() {
        running = false
        // Block until the loop thread has fully exited, so any frame already drawing finishes against
        // the still-valid surface and no new frame starts after we return. join() is what makes the
        // SurfaceView teardown safe.
        thread?.let { runCatching { it.join() } }
        thread = null
    }
}
