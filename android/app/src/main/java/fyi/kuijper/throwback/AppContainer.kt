package fyi.kuijper.throwback

import android.app.Application
import fyi.kuijper.throwback.db.AppDatabase
import fyi.kuijper.throwback.engine.IndexUpdater
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
 * Process-wide layer owning one instance of each collaborator + engine, so the Activity and the
 * screensaver [dream.ThrowbackDreamService] share the same session, index and running slideshow. The
 * engines run on a process scope, not viewModelScope, so the show survives the Activity↔Dream transition.
 */
class AppContainer(app: Application) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val settings = Settings(app)
    val store = TokenStore(app)
    val session = Session(store)
    val db = AppDatabase.create(app).photoDao()
    // One shared Graph transport (token, retry, pagination, error translation) under all Graph modules.
    private val graphHttp = OkHttpGraphHttp(session::accessToken)
    val graph = GraphClient(graphHttp)

    private val media = GraphMedia(graphHttp)
    private val graphSync = GraphSync(graphHttp)
    private val placeResolver = PlaceResolver(app)

    val slideshow = SlideshowEngine(app, db, media, scope) { settings.slideSeconds }
    private val indexUpdater = IndexUpdater(
        db, placeResolver,
        onAdded = slideshow::appendIds,
        onRemoved = slideshow::removeIds,
    )
    val sync = SyncEngine(db, graphSync, indexUpdater, scope)
}
