@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import androidx.tv.material3.Button
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import fyi.kuijper.throwback.Crumb
import fyi.kuijper.throwback.MainViewModel
import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.onedrive.DriveItem

@Composable
fun ConnectFlow(state: UiState, vm: MainViewModel) {
    when (state) {
        is UiState.NeedsConnect -> ConnectScreen(onConnect = vm::connect)
        is UiState.ShowCode -> CodeScreen(state)
        is UiState.PickFolder -> FolderPicker(
            state = state,
            onOpen = { vm.openFolder(it) },
            onBack = vm::back,
            onSelect = vm::selectCurrentFolder,
        )
        is UiState.Ready -> ReadyScreen(
            state = state,
            onShow = vm::startShow,
            onSync = vm::startSync,
            onSettings = vm::openSettings,
            onReset = vm::disconnect,
        )
        is UiState.Settings -> SettingsScreen(
            state = state,
            onSeconds = vm::setSlideSeconds,
            onShuffle = vm::setShuffle,
            onClose = vm::closeSettings,
        )
        is UiState.Syncing -> SyncingScreen(state)
        is UiState.Show -> SlideshowScreen(
            state = state,
            onNext = vm::nextPhoto,
            onPrev = vm::previousPhoto,
            onToggle = vm::togglePause,
            onExit = vm::exitShow,
        )
        is UiState.Error -> ErrorScreen(state, onRetry = vm::retry)
    }
}

@Composable
private fun Centered(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(48.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}

@Composable
private fun ConnectScreen(onConnect: () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Centered {
        Text("Throwback", fontSize = 48.sp)
        Spacer(Modifier.height(12.dp))
        Text("Toon de familiefoto's uit OneDrive op de TV.")
        Spacer(Modifier.height(32.dp))
        Button(onClick = onConnect, modifier = Modifier.focusRequester(focus)) {
            Text("OneDrive koppelen")
        }
    }
}

@Composable
private fun CodeScreen(state: UiState.ShowCode) {
    Centered {
        Text("Koppel je OneDrive", fontSize = 32.sp)
        Spacer(Modifier.height(24.dp))
        Text("Ga op je telefoon naar:")
        Text(state.code.verificationUri, fontSize = 28.sp)
        Spacer(Modifier.height(16.dp))
        Text("en voer deze code in:")
        Text(state.code.userCode, fontSize = 56.sp)
        Spacer(Modifier.height(24.dp))
        Text("Log in met het account dat de foto's heeft. Wachten op inloggen…")
    }
}

@Composable
private fun FolderPicker(
    state: UiState.PickFolder,
    onOpen: (Crumb) -> Unit,
    onBack: () -> Unit,
    onSelect: () -> Unit,
) {
    val canActOnFolder = state.path.size > 1
    Column(modifier = Modifier.fillMaxSize().padding(32.dp)) {
        Text("Kies de fotomap", fontSize = 28.sp)
        Text(state.path.joinToString("  ›  ") { it.name })
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (canActOnFolder) {
                Button(onClick = onSelect) { Text("Kies deze map") }
                Button(onClick = onBack) { Text("Terug") }
            }
        }
        Spacer(Modifier.height(16.dp))
        when {
            state.loading -> Text("Laden…")
            state.folders.isEmpty() -> Text("Geen submappen hier. Kies deze map of ga terug.")
            else -> FolderList(state.folders, onOpen)
        }
    }
}

@Composable
private fun FolderList(folders: List<DriveItem>, onOpen: (Crumb) -> Unit) {
    val first = remember { FocusRequester() }
    LaunchedEffect(folders) { runCatching { first.requestFocus() } }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(folders) { item ->
            val mod = if (item == folders.first()) Modifier.focusRequester(first) else Modifier
            Button(onClick = { onOpen(Crumb(item.id, item.name)) }, modifier = mod) {
                Text("${item.name}  (${item.childCount})")
            }
        }
    }
}

@Composable
private fun ReadyScreen(
    state: UiState.Ready,
    onShow: () -> Unit,
    onSync: () -> Unit,
    onSettings: () -> Unit,
    onReset: () -> Unit,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Centered {
        Text("Gekoppeld ✓", fontSize = 32.sp)
        Spacer(Modifier.height(12.dp))
        Text("Map: ${state.folderName}")
        Spacer(Modifier.height(8.dp))
        Text("Geïndexeerd: ${state.indexed} foto's  (${state.described} met beschrijving)")
        Spacer(Modifier.height(24.dp))
        if (state.indexed > 0) {
            Button(onClick = onShow, modifier = Modifier.focusRequester(focus)) { Text("Diashow starten") }
            Spacer(Modifier.height(12.dp))
            Button(onClick = onSync) { Text("Bijwerken") }
        } else {
            Button(onClick = onSync, modifier = Modifier.focusRequester(focus)) { Text("Foto's indexeren") }
        }
        Spacer(Modifier.height(12.dp))
        Button(onClick = onSettings) { Text("Instellingen") }
        Spacer(Modifier.height(12.dp))
        Button(onClick = onReset) { Text("Andere map / opnieuw koppelen") }
    }
}

@Composable
private fun SettingsScreen(
    state: UiState.Settings,
    onSeconds: (Int) -> Unit,
    onShuffle: (Boolean) -> Unit,
    onClose: () -> Unit,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Centered {
        Text("Instellingen", fontSize = 32.sp)
        Spacer(Modifier.height(24.dp))
        Text("Seconden per foto: ${state.slideSeconds}")
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = { onSeconds(state.slideSeconds - 1) }, modifier = Modifier.focusRequester(focus)) {
                Text("− korter")
            }
            Button(onClick = { onSeconds(state.slideSeconds + 1) }) { Text("+ langer") }
        }
        Spacer(Modifier.height(24.dp))
        Text("Volgorde: ${if (state.shuffle) "shuffle" else "chronologisch"}")
        Spacer(Modifier.height(8.dp))
        Button(onClick = { onShuffle(!state.shuffle) }) {
            Text(if (state.shuffle) "Zet op chronologisch" else "Zet op shuffle")
        }
        Spacer(Modifier.height(32.dp))
        Button(onClick = onClose) { Text("Terug") }
    }
}

@Composable
private fun SlideshowScreen(
    state: UiState.Show,
    onNext: () -> Unit,
    onPrev: () -> Unit,
    onToggle: () -> Unit,
    onExit: () -> Unit,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focus)
            .focusable()
            .onKeyEvent { e ->
                if (e.type != KeyEventType.KeyDown) return@onKeyEvent false
                when (e.key) {
                    Key.DirectionLeft -> { onPrev(); true }
                    Key.DirectionRight -> { onNext(); true }
                    Key.DirectionCenter, Key.Enter -> { onToggle(); true }
                    Key.Back -> { onExit(); true }
                    else -> false
                }
            },
    ) {
        // Crossfade tussen foto's; de vorige blijft zichtbaar tijdens de overgang (geen zwart).
        Crossfade(targetState = state.imageUrl, animationSpec = tween(1500), label = "foto") { url ->
            if (url != null) {
                Box(modifier = Modifier.fillMaxSize()) {
                    // Wazige, schermvullende achtergrond — vult letterbox-randen (zoals Google's screensaver).
                    AsyncImage(
                        model = url,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize().blur(32.dp),
                    )
                    // Scherpe, volledige foto erbovenop.
                    AsyncImage(
                        model = url,
                        contentDescription = null,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(40.dp),
        ) {
            state.photo?.let { p ->
                val year = p.year?.let { " · $it" }.orEmpty()
                Text("${p.event}$year", fontSize = 30.sp)
                p.description?.let { Text(it, fontSize = 22.sp) }
            }
            if (state.paused) Text("⏸ gepauzeerd")
        }
    }
}

@Composable
private fun SyncingScreen(state: UiState.Syncing) {
    Centered {
        Text("Indexeren…", fontSize = 32.sp)
        Spacer(Modifier.height(12.dp))
        Text("Map: ${state.folderName}")
        Spacer(Modifier.height(8.dp))
        Text("${state.count} foto's verwerkt", fontSize = 28.sp)
        Spacer(Modifier.height(8.dp))
        Text("Dit kan bij een grote bibliotheek even duren. Je kunt het scherm laten staan.")
    }
}

@Composable
private fun ErrorScreen(state: UiState.Error, onRetry: () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Centered {
        Text("Er ging iets mis", fontSize = 28.sp)
        Spacer(Modifier.height(12.dp))
        Text(state.message)
        Spacer(Modifier.height(24.dp))
        Button(onClick = onRetry, modifier = Modifier.focusRequester(focus)) { Text("Opnieuw") }
    }
}
