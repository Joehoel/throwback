# Device-code login via directe HTTP, niet de MSAL-Android-SDK

Voor het inloggen op het persoonlijke OneDrive-account gebruiken we de OAuth 2.0 device authorization grant. Overwogen: de MSAL-Android-SDK (die device-code sinds v2.0 ondersteunt). Gekozen voor een **directe HTTP-implementatie** (OkHttp) tegen `login.microsoftonline.com/consumers`.

Waarom:
- Het is maar een tweetal calls (`/devicecode` + pollen op `/token`) plus refresh — precies wat we in `spike/verify_description.py` al bewezen.
- Geen MSAL-config-JSON, geen `BrowserTabActivity`/redirect-URI, geen broker-afhankelijkheden — minder bewegende delen en minder bouwrisico.
- Volledig transparant en makkelijk te debuggen.

## Consequences

- Wij beheren token-refresh zelf (triviaal: `grant_type=refresh_token`).
- Implementatie: `onedrive/OneDriveAuth.kt`. Scope `Files.Read offline_access`.
