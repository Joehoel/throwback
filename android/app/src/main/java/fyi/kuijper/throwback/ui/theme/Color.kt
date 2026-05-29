package fyi.kuijper.throwback.ui.theme

import androidx.compose.ui.graphics.Color

// Strak, donker Material 3-palet voor TV. Geen puur #000/#FFF: near-black surfaces met
// oplopende tonale lagen, en één warme amber accentkleur (past bij "throwback"/nostalgie).
// Triviaal te wisselen door alleen Primary/PrimaryContainer aan te passen.

// Achtergrond & oppervlakken (donker → iets lichter voor tonale diepte).
val Background = Color(0xFF0E0F12)
val Surface = Color(0xFF15171C)
val SurfaceVariant = Color(0xFF24272E) // containers, chips, rijen
val Border = Color(0xFF3A3E47)

// Tekst & iconen (warme near-white, niet puur wit).
val OnBackground = Color(0xFFE7E3DE)
val OnSurface = Color(0xFFE7E3DE)
val OnSurfaceVariant = Color(0xFFB6B2BC)

// Accent (amber).
val Primary = Color(0xFFFFB870)
val OnPrimary = Color(0xFF3A2400)
val PrimaryContainer = Color(0xFF4A3413)
val OnPrimaryContainer = Color(0xFFFFDDB8)

// Secundair (neutraal warm grijs).
val Secondary = Color(0xFFCEC7BF)
val SecondaryContainer = Color(0xFF2C2F36)

// Fout.
val ErrorColor = Color(0xFFFFB4AB)
val OnErrorColor = Color(0xFF5C0007)
