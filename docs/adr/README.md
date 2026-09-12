# Architecture Decision Records

Eén beslissing per bestand, genummerd en append-only. Nieuwe beslissing → nieuwe ADR (en zo nodig een
pointer-noot in de oude). Scope: **TV** = de Fotoshow (Android TV-app), **Web** = de Beheer-webapp
(`web/`), **Beide** = fundamenteel/gedeeld.

| # | Beslissing | Scope |
|---|------------|-------|
| [0001](0001-onedrive-is-bron-van-waarheid.md) | OneDrive is de bron van waarheid, niet Google Photos | Beide |
| [0002](0002-beschrijving-uit-onedrive-description-veld.md) | Beschrijving komt uit het OneDrive `description`-veld | Beide |
| [0003](0003-gewone-app-geen-screensaver.md) | v1 is primair een gewone app; DreamService aangeboden maar niet vereist | TV |
| [0004](0004-lokale-index-met-graph-delta-en-coil-cache.md) | Lokale index (Room) als bron van waarheid, via Graph delta, met Coil-cache | TV |
| [0005](0005-device-code-via-directe-http.md) | Device-code login via directe HTTP, niet de MSAL-Android-SDK | TV |
| [0006](0006-boot-handshake-blijft-in-de-coordinator.md) | De eerste-foto's-handshake blijft in de coordinator | TV |
| [0007](0007-observability-met-sentry.md) | Observability via Sentry, privacy-bewust | Beide |
| [0008](0008-locatie-via-exif-gps-re-upload.md) | Locatie schrijven via EXIF GPS-re-upload, niet via Graph | Web |
| [0009](0009-eigen-d1-foto-index-voor-beheer-webapp.md) | Beheer-webapp houdt een eigen foto-index in D1 | Web |
| [0010](0010-infra-via-alchemy-op-cloudflare-workers.md) | Infra als code via Alchemy v2, op Cloudflare Workers | Web |
| [0011](0011-onedrive-writes-via-per-foto-workflows.md) | OneDrive-writes via per-foto Cloudflare Workflows | Web |
| [0012](0012-effect-v4-smol-als-applicatie-paradigma.md) | Effect v4 (smol) als applicatie-paradigma + package-selectie | Web |
| [0013](0013-web-code-conventies.md) | Web code-conventies: Engels, branded ids, mappers in Schema-transforms, `Schema.TaggedError` | Web |
| [0014](0014-toetsenbordsneltoetsen-reviewscherm.md) | Toetsenbordsneltoetsen voor het reviewscherm via `@tanstack/react-hotkeys` | Web |
| [0015](0015-xstate-orkestratie-reviewscherm.md) | XState als orkestratielaag (grens met TanStack Query en TanStack AI) | Web |
| [0016](0016-ui-met-cloudflare-kumo-splitscreen-richting.md) | UI met Cloudflare Kumo; Splitscreen als gekozen reviewscherm-richting | Web |
| [0017](0017-kaart-ui-via-vis-gl-react-google-maps.md) | Kaart-UI via `@vis.gl/react-google-maps`; geocoding-key-strategie | Web |
| [0018](0018-tanstack-ai-in-workerd-suggestie-en-locatie.md) | TanStack AI (Gemini) in workerd geverifieerd; locatie-gok zonder custom model | Web |
| [0019](0019-bestandsmetadata-als-bron-van-waarheid.md) | Bestandsmetadata is de bron van waarheid voor Beschrijving en Locatie | Beide |
| [0020](0020-oxfmt-is-de-formatteer-autoriteit.md) | Oxfmt is de formatteerautoriteit | Beide |
| [0021](0021-authentication-and-access-boundaries.md) | Authentication and access boundaries for the Curation webapp | Web |
| [0022](0022-verified-conditional-jpeg-metadata-transaction.md) | Verified conditional JPEG metadata transaction | Web |
| [0023](0023-effect-httpapi-generated-browser-contract.md) | Effect HttpApi with a generated browser contract | Web |
| [0024](0024-server-authoritative-sync-and-client-state.md) | Server-authoritative synchronization and client state | Web |
| [0025](0025-recoverable-failures-and-privacy-safe-diagnostics.md) | Recoverable failures and privacy-safe diagnostics | Web |
| [0026](0026-clean-rebuild-and-atomic-production-cutover.md) | Clean rebuild and atomic production cutover | Web |
| [0027](0027-proportional-v1-release-evidence.md) | Proportional v1 release evidence | Web |
