package fyi.kuijper.throwback.player

import fyi.kuijper.throwback.onedrive.PhotoRow
import org.junit.Assert.assertEquals
import org.junit.Test

class PhotoOrderTest {

    private fun p(id: String, year: Int?, taken: String? = null) =
        PhotoRow(id = id, name = "$id.jpg", event = "ev", year = year, description = null, taken = taken, path = "/p")

    @Test
    fun `chronologisch sorteert op jaar, daarna op opnamedatum`() {
        val photos = listOf(
            p("c", 2020),
            p("a", 2018),
            p("b1", 2019, "2019-07-01T00:00:00Z"),
            p("b2", 2019, "2019-03-01T00:00:00Z"),
        )
        assertEquals(listOf("a", "b2", "b1", "c"), PhotoOrder.chronological(photos))
    }

    @Test
    fun `foto's zonder jaar komen achteraan`() {
        val photos = listOf(p("x", null), p("y", 2010))
        assertEquals(listOf("y", "x"), PhotoOrder.chronological(photos))
    }
}
