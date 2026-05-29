package fyi.kuijper.throwback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.UnknownHostException

class ErrorsTest {

    @Test
    fun `netwerkfout geeft een wifi-melding`() {
        val msg = Errors.message(UnknownHostException("graph.microsoft.com"))
        assertTrue(msg, msg.contains("internet", ignoreCase = true) || msg.contains("wifi", ignoreCase = true))
    }

    @Test
    fun `andere fout behoudt zijn eigen melding`() {
        assertEquals("Map is leeg", Errors.message(IllegalStateException("Map is leeg")))
    }

    @Test
    fun `fout zonder melding geeft een nette terugval`() {
        assertEquals("Er ging iets mis.", Errors.message(RuntimeException()))
    }
}
