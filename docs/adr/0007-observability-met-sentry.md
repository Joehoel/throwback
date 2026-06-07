# Observability via Sentry, privacy-bewust

De app draait op het TV-kastje van de vader — buiten ons zicht. Als het indexeren vastloopt, een
token verloopt of thumbnails niet laden, zien we dat nu alleen als hij belt. Fouten worden bovendien
ingeslikt: `SyncEngine` zet ze in `State.lastError` (alleen zichtbaar in Instellingen) en de Fotoshow
draait door op wat al geïndexeerd is. We willen die stille fouten zien, plus de duur van de zware
operaties (crawl, delta, geocoderen, inloggen).

Gekozen: **Sentry** (Android SDK 8.x + Gradle-plugin), geïnitialiseerd in `ThrowbackApp.onCreate`.

## Wat we instrumenteren

- **Ingeslikte fouten als events.** De `catch`-blokken in `SyncEngine` (crawl + delta) en de
  gebruikersgerichte fout-sinks in `MainViewModel` (`connect`, `handleError`) melden via de
  `Telemetry`-façade. De UX blijft gelijk — de show draait door — maar de fout wordt nu gezien.
- **Transactions** voor de belangrijke operaties: `index.crawl` (eerste index, met child-spans
  `crawl.fetch` + `geocode`) en `index.delta` (incrementele verversing per tik). Login/refresh en alle
  Graph-calls komen als `http.client`-spans binnen via de `SentryOkHttpInterceptor` op beide
  OkHttp-clients (transport + auth).
- **Breadcrumbs** bij navigatie/gebruikersacties (connect, mapwissel, retry, disconnect) en bij een
  mislukte thumbnail (per-slide, dus géén event — dat zou ruis zijn).
- **Logs + Room-query's** (die laatste via bytecode-instrumentatie van de Gradle-plugin). Continue
  UI-profiling stond eerst aan, maar floodt op SDK 8.43 het project (HTTP 429 + "No enum constant
  …ProfileUi") — daarom uit gezet tot dat SDK-probleem opgelost is.

`SentryContext` (sentry-kotlin-extensions) propageert de scope over de coroutine-threadwissels, zodat
de http-spans onder de juiste transaction nestelen.

## Privacy

De **Bibliotheek** zijn privé-familiefoto's. Daarom expliciet:

- **Geen Session Replay** — dat zou de foto's in beeld opnemen.
- `sendDefaultPii = false`.
- Breadcrumb-URL's voor OneDrive-content/SharePoint/blob-hosts worden van hun querystring ontdaan
  (`beforeBreadcrumb`), zodat kortlevende SAS-tokens nooit het toestel verlaten. De
  OkHttp-interceptor leest geen headers of request-body, dus device-code en refresh-token lekken niet.

## Considered Options

- **Geen observability / alleen Logcat** — verworpen: Logcat is er niet bij een kastje op afstand.
- **Firebase Crashlytics** — verworpen: alleen crashes, geen transactions/spans; en zou een
  Google-services-plugin toevoegen. Sentry geeft fouten *en* performance in één.
- **Session Replay aan met masking** — verworpen voor deze app (zie Privacy); de meerwaarde op een
  passieve TV-slideshow is bijna nul.

## Consequences

- De DSN staat in de code (publiek, veilig). Het **auth-token** (voor source-context/mapping-upload op
  release-builds) is een secret: gelezen uit `SENTRY_AUTH_TOKEN` of `sentryAuthToken` in
  `~/.gradle/gradle.properties` — buiten de repo, nooit gecommit. Debug-builds en mensen zonder token
  bouwen gewoon; de upload-stappen no-op'en dan.
- `buildFeatures { buildConfig = true }` moest aan, zodat de init `BuildConfig` (environment/release)
  kan lezen — stond uit (default in AGP 8+).
- Traces-sampling staat op 1.0: lage-volume familie-app (crawl + 10-min delta), dus compleet en
  goedkoop. Bij meer verkeer omlaag bijstellen. Profiling staat uit (zie boven).
- AGP 9: de Sentry-plugin was kort kapot op AGP 9.0 (issue #1004), opgelost vanaf plugin 5.12.2; wij
  draaien 6.9.0.
