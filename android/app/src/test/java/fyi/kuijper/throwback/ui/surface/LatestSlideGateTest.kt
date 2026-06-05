package fyi.kuijper.throwback.ui.surface

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LatestSlideGateTest {

    @Test
    fun `de nieuwste token wint, een oudere wordt afgewezen`() {
        val gate = LatestSlideGate()
        val old = gate.issue()
        val new = gate.issue()
        // The slow earlier load (old) finishing late must not overwrite the newer photo.
        assertFalse(gate.isLatest(old))
        assertTrue(gate.isLatest(new))
    }

    @Test
    fun `de eerste aanvraag is meteen de nieuwste`() {
        val gate = LatestSlideGate()
        val first = gate.issue()
        assertTrue(gate.isLatest(first)) // the opening photo must present, nothing precedes it
    }

    @Test
    fun `de nieuwste token blijft geldig bij herhaald checken`() {
        // A cache hit and a post-decode present can both check the same token; it must stay accepted.
        val gate = LatestSlideGate()
        val t = gate.issue()
        assertTrue(gate.isLatest(t))
        assertTrue(gate.isLatest(t))
    }
}
