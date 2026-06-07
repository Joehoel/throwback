# OneDrive is de bron van waarheid, niet Google Photos

De familiefoto's staan zowel in Google Photos als in OneDrive. De vader heeft in beide titels/beschrijvingen toegevoegd. Sinds 31 maart 2025 staat de Google Photos Library API op slot: apps kunnen alleen nog eigen geüploade media lezen, en de Picker API geeft het beschrijvingsveld niet terug. OneDrive is via Microsoft Graph wél volledig leesbaar, inclusief het `description`-veld en de mappenboom (jaar → maand → gebeurtenis).

Daarom: **OneDrive wordt de bron van waarheid.** De vader cureert voortaan in OneDrive (mappen + beschrijvingen); Google Photos blijft hooguit een kijk-kopie. De app leest uitsluitend OneDrive.

## Consequences

- Beschrijvingen die alleen in Google Photos staan, zijn voor de app onzichtbaar — deze moeten (eenmalig) naar OneDrive overgezet worden als ze meetellen.
- De werkwijze van de vader verandert: nieuwe gebeurtenissen + beschrijvingen horen in OneDrive thuis.

## Status

**Gedeeltelijk herzien door ADR-0019 (2026-06-07):** de *embedded bestandsmetadata* wordt de bron van waarheid en de **Beheer-webapp** cureert lokaal-direct; OneDrive blijft sync/transport (vs. Google Photos blijft dit ongewijzigd). De **Fotoshow** leest voorlopig nog via Graph.
