package fyi.kuijper.throwback.ui.surface

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class RenderLoopTest {

    @Test
    fun `start laat het frame herhaaldelijk draaien`() {
        val loop = RenderLoop(frameMs = 1)
        val threeFrames = CountDownLatch(3)
        loop.start { threeFrames.countDown() }
        val ran = threeFrames.await(2, TimeUnit.SECONDS) // the loop must keep calling frame, not just once
        loop.stop()
        assertTrue("frame should run repeatedly while started", ran)
    }

    @Test
    fun `stop wacht op een lopend frame en daarna draait er geen frame meer`() {
        // This is the crash invariant: SurfaceView destroys its surface the moment surfaceDestroyed
        // returns, so stop() must not return while a frame is mid-draw (it would post to a dead buffer
        // -> native SIGABRT), and no frame may begin after stop() has returned.
        val loop = RenderLoop(frameMs = 1)
        val frameInProgress = CountDownLatch(1)
        val releaseFrame = CountDownLatch(1)
        val stopReturned = AtomicBoolean(false)
        val frameRanAfterStop = AtomicBoolean(false)
        val firstFrame = AtomicBoolean(true)

        loop.start {
            if (stopReturned.get()) frameRanAfterStop.set(true)
            if (firstFrame.compareAndSet(true, false)) {
                frameInProgress.countDown() // hold the very first frame open, mid-"draw"
                releaseFrame.await()
            }
        }

        assertTrue("a frame should start", frameInProgress.await(2, TimeUnit.SECONDS))
        val stopper = Thread { loop.stop(); stopReturned.set(true) }.also { it.start() }

        Thread.sleep(50) // stop() must be blocked on the held frame, not returned
        assertFalse("stop must wait for the in-flight frame", stopReturned.get())

        releaseFrame.countDown() // let the held frame finish
        stopper.join(2_000)
        assertTrue("stop should return once the frame finished", stopReturned.get())

        Thread.sleep(20) // give any erroneous extra frame a chance to slip through
        assertFalse("no frame may run after stop() returned", frameRanAfterStop.get())
    }

    @Test
    fun `stop zonder start doet niets`() {
        // surfaceDestroyed can fire without a surface ever having started the loop; it must not throw.
        RenderLoop(frameMs = 1).stop()
    }

    @Test
    fun `een tweede start laat geen wees-draad achter die stop overleeft`() {
        // surfaceCreated may fire twice; a second start must not orphan a thread that keeps drawing
        // after stop() (which would still post to the dead surface).
        val loop = RenderLoop(frameMs = 1)
        val frames = java.util.concurrent.atomic.AtomicInteger(0)
        val ranAfterStop = AtomicBoolean(false)
        val stopped = AtomicBoolean(false)
        val body: () -> Unit = {
            if (stopped.get()) ranAfterStop.set(true)
            frames.incrementAndGet()
        }
        loop.start(body)
        loop.start(body) // second start — must not spawn a parallel, unstoppable loop
        Thread.sleep(30)
        loop.stop()
        stopped.set(true)

        Thread.sleep(30) // any surviving thread would tick here
        assertFalse("a second start must not leave a thread running past stop()", ranAfterStop.get())
    }
}
