package fyi.kuijper.throwback

import android.app.Application
import fyi.kuijper.throwback.db.AppDatabase
import fyi.kuijper.throwback.engine.SlideshowEngine
import fyi.kuijper.throwback.engine.SyncEngine
import fyi.kuijper.throwback.onedrive.GraphClient
import fyi.kuijper.throwback.onedrive.GraphMedia
import fyi.kuijper.throwback.onedrive.GraphSync
import fyi.kuijper.throwback.onedrive.OkHttpGraphHttp
import fyi.kuijper.throwback.onedrive.PlaceResolver
import fyi.kuijper.throwback.onedrive.Session
import fyi.kuijper.throwback.onedrive.TokenStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * Proces-brede laag die één instantie van elke collaborator + engine bezit, zodat de app-Activity
 * en de screensaver-[dream.ThrowbackDreamService] dezelfde sessie, index en lopende slideshow
 * delen (i.p.v. elk een eigen ViewModel met dubbele engines). De engines draaien op een
 * proces-scope, niet op viewModelScope, zodat de show doorloopt bij de Activity↔Dream-overgang.
 */
class AppContainer(app: Application) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val settings = Settings(app)
    val store = TokenStore(app)
    val session = Session(store)
    val db = AppDatabase.create(app).photoDao()
    // Eén gedeeld Graph-transport (token, retry, paginatie, foutvertaling) onder alle Graph-modules.
    private val graphHttp = OkHttpGraphHttp(session::accessToken)
    val graph = GraphClient(graphHttp)

    private val media = GraphMedia(graphHttp)
    private val graphSync = GraphSync(graphHttp)
    private val placeResolver = PlaceResolver(app)

    val slideshow = SlideshowEngine(app, db, media, scope) { settings.slideSeconds }
    val sync = SyncEngine(db, graphSync, placeResolver, scope, onRemoved = slideshow::removeIds)
}
