package fyi.kuijper.throwback.onedrive

/**
 * Levert een TV-formaat thumbnail-URL voor een foto. Graph maakt thumbnails als
 * JPEG, ongeacht het bronformaat (HEIC/PNG/…), dus dit ondersteunt alle formaten.
 * URL's zijn kortlevend → vlak vóór weergave ophalen, niet bewaren (ADR-0004).
 *
 * Transport (token, retry, foutvertaling) zit in [GraphHttp]; hier kennen we alleen het pad.
 * Een ontbrekende thumbnail (404) is legitiem → `null`; een transiente fout (503) gooit en wordt
 * bewust door [fyi.kuijper.throwback.engine.SlideshowEngine] tot een offline-hintje afgevangen.
 */
class GraphMedia(private val http: GraphHttp) {

    suspend fun thumbnailUrl(id: String): String? =
        http.getJsonOrNull("/me/drive/items/$id/thumbnails/0/large")
            ?.optString("url")
            ?.ifBlank { null }
}
