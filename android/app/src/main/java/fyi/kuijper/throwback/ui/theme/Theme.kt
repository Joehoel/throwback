package fyi.kuijper.throwback.ui.theme

import androidx.compose.runtime.Composable
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

// TV is dark-first: we forceren altijd het donkere schema (geen light variant).
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ThrowbackTheme(content: @Composable () -> Unit) {
    val colorScheme = darkColorScheme(
        primary = Primary,
        onPrimary = OnPrimary,
        primaryContainer = PrimaryContainer,
        onPrimaryContainer = OnPrimaryContainer,
        secondary = Secondary,
        secondaryContainer = SecondaryContainer,
        background = Background,
        onBackground = OnBackground,
        surface = Surface,
        onSurface = OnSurface,
        surfaceVariant = SurfaceVariant,
        onSurfaceVariant = OnSurfaceVariant,
        border = Border,
        error = ErrorColor,
        onError = OnErrorColor,
    )
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content,
    )
}
