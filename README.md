# Throwback

Een Android TV-app die de familiefotobibliotheek uit OneDrive als schermvullende
slideshow op de TV toont, met de gebeurtenis en het jaar in beeld. Gemaakt voor
de zondagse borrel op de Google TV.

Foto's blijven in OneDrive staan (de bron van waarheid). De app indexeert een
gekozen map lokaal via Microsoft Graph delta, cachet thumbnails en speelt ze af
als doorlopende slideshow met onderschrift.

## Bouwen & draaien

Vereist een JDK 17+ en de Android SDK (compileSdk 36, minSdk 26).

```bash
cd android
./gradlew assembleDebug          # APK bouwen
./gradlew installDebug           # installeren op een gekoppeld toestel/box
./gradlew test                   # unit tests
```

Bij de eerste start koppel je een OneDrive-account (device-code login) en kies je
de **hoofdmap** binnen de bibliotheek; vanaf dan indexeert en toont de app alleen
die tak.

## Observability (optioneel)

De app meldt afgehandelde fouten en de duur van zware operaties aan Sentry via de
`Telemetry`-façade. Zonder DSN is alles een no-op, dus bouwen werkt zonder setup.
Voor het uploaden van source context en ProGuard-mappings bij een release-build
leest de Sentry Gradle-plugin een secret uit de omgeving (nooit in de repo):

```bash
export SENTRY_AUTH_TOKEN=…        # of `sentryAuthToken` in ~/.gradle/gradle.properties
./gradlew assembleRelease         # of -PsentryUpload=false om upload over te slaan
```

## Documentatie

- [CONTEXT.md](./CONTEXT.md) — de domeintaal (Bibliotheek, Gebeurtenis, Onderschrift, …)
- [PRD.md](./PRD.md) — wat de app moet doen
- [docs/adr/](./docs/adr/) — de dragende ontwerpbeslissingen
