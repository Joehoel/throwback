@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Button
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.LocalContentColor
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Surface
import androidx.tv.material3.Switch
import androidx.tv.material3.Text
import fyi.kuijper.throwback.ui.theme.SpaceM
import fyi.kuijper.throwback.ui.theme.SpaceS

@Composable
fun rememberInitialFocus(): FocusRequester {
    val requester = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { requester.requestFocus() } }
    return requester
}

@Composable
fun ScreenHeader(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Text(text = title, style = MaterialTheme.typography.headlineMedium)
        if (subtitle != null) {
            Spacer(Modifier.height(SpaceS))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
fun ActionButton(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
) {
    val content: @Composable () -> Unit = {
        Icon(icon, contentDescription = null, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(SpaceS))
        Text(label, style = MaterialTheme.typography.labelLarge)
    }
    if (primary) {
        Button(onClick = onClick, modifier = modifier) { content() }
    } else {
        OutlinedButton(onClick = onClick, modifier = modifier) { content() }
    }
}

/**
 * Own Surface row (not WideButton) so the height grows with the content and the subtitle never
 * clips; the text inherits the content color, which flips on focus.
 */
@Composable
private fun SurfaceRow(
    onClick: () -> Unit,
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    leading: @Composable () -> Unit,
) {
    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(14.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            leading()
            Spacer(Modifier.width(SpaceM))
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium)
                if (subtitle != null) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = LocalContentColor.current.copy(alpha = 0.75f),
                    )
                }
            }
        }
    }
}

@Composable
fun WideRow(
    title: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
) {
    SurfaceRow(onClick = onClick, title = title, subtitle = subtitle, modifier = modifier) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(28.dp))
    }
}

@Composable
fun SwitchRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    SurfaceRow(onClick = onToggle, title = title, subtitle = subtitle, modifier = modifier) {
        Switch(checked = checked, onCheckedChange = null)
    }
}

/** Indeterminate spinner; tv-material ships no progress indicator. */
@Composable
fun TvSpinner(
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
    strokeWidth: Dp = 4.dp,
) {
    val transition = rememberInfiniteTransition(label = "spinner")
    val angle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "angle",
    )
    val color = MaterialTheme.colorScheme.primary
    Canvas(modifier = modifier.size(size).rotate(angle)) {
        val stroke = strokeWidth.toPx()
        drawArc(
            color = color,
            startAngle = 0f,
            sweepAngle = 270f,
            useCenter = false,
            topLeft = androidx.compose.ui.geometry.Offset(stroke / 2, stroke / 2),
            size = androidx.compose.ui.geometry.Size(this.size.width - stroke, this.size.height - stroke),
            style = Stroke(width = stroke, cap = StrokeCap.Round),
        )
    }
}

@Composable
fun LoadingRow(label: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        TvSpinner(size = 28.dp, strokeWidth = 3.dp)
        Spacer(Modifier.width(SpaceS))
        Text(
            label,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
