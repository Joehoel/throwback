package fyi.kuijper.throwback.ui.surface

/**
 * EXPLORATION (branch explore/surfaceview-4k). A monotonic request gate that makes the surface
 * renderer's *asynchronous* slide loads land in order. Each time a new photo is requested the caller
 * takes a token via [issue]; when its (slow) decode finishes it presents only if [isLatest] still holds.
 *
 * Why: unlike the declarative Compose `Crossfade` — which always converges on the latest `imageUrl` —
 * the surface path decodes off-thread and then imperatively calls `present()`. Without this gate a
 * slower earlier decode could finish *after* a newer one and overwrite it, so rapid next/previous lands
 * on a photo you already passed (the "feels random" bug). The gate guarantees the photo on screen is the
 * one most recently asked for, regardless of which decode finishes first.
 *
 * Single-threaded by contract: [issue]/[isLatest] are called from the main thread (the Compose effect),
 * so no synchronisation is needed.
 */
class LatestSlideGate {
    private var latest = 0L

    /** Claim a token for a new request; it becomes the only one [isLatest] will accept. */
    fun issue(): Long = ++latest

    /** True only for the most recently [issue]d token — i.e. this load still represents what's wanted. */
    fun isLatest(token: Long): Boolean = token == latest
}
