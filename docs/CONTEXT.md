# Throwback

Een Android TV-app die de familiefotobibliotheek uit OneDrive als schermvullende slideshow op de TV toont, met titel en jaar in beeld. Gebruikt tijdens de zondagse borrel.

## Language

**Bibliotheek**:
De volledige verzameling familiefoto's, opgeslagen als mappenboom in OneDrive (jaar → maand → gebeurtenis). De bron van waarheid voor de app. De Hoofdmap wordt niet hardcoded maar in de app zelf gekozen na het koppelen van het OneDrive-account; de app toont en bewerkt uitsluitend die tak.
_Avoid_: Album, collectie

**Curator**:
De ene persoon die de **Beheer-webapp** mag gebruiken en de **Bibliotheek** beheert, op één of meer eigen apparaten. De Curator claimt een installatie één keer met een Microsoft-account; daarna volgt autorisatie de stabiele provideridentiteit van dat account, nooit een e-mailadres. Een ander Microsoft-account koppelen is een administratieve reset, geen gewone login.
_Avoid_: Gebruiker, beheerder, e-mailadres als identiteit

**Foto**:
Eén afbeeldingsbestand in de **Bibliotheek**. Hernoemen of verplaatsen maakt er geen andere Foto van; een kopie of een verwijderd en opnieuw toegevoegd bestand is wél een nieuwe Foto, ook als naam, pad of beeldinhoud gelijk is. Reviewhistorie volgt daarom de bestandsidentiteit, niet het pad of een inhoudshash.
_Avoid_: Pad of inhoudshash als identiteit

**Gebeurtenis**:
Een map op het diepste niveau (onder jaar/maand) die één voorval bevat; de mapnaam dient als titel.
_Avoid_: Event, album, map

**Beschrijving**:
De per-foto tekst die de vader vastlegt in de **metadata van het bestand** (canoniek **XMP `dc:description`**, UTF-8) — zelf getypt óf een AI-suggestie die hij goedkeurt (zie de **Beheer-webapp**). Blijft "zijn" tekst: niets landt zonder goedkeuring. Optioneel — niet elke foto heeft er een. Dezelfde tekst wordt gespiegeld naar XMP `dc:title` en de accent-veilige Windows-tags `XPTitle` en `XPSubject`; het onbetrouwbare EXIF `ImageDescription` is geen geldige mirror.
_Avoid_: Caption, bijschrift

**Suggestie**:
Een tijdelijk, door AI gegenereerd voorstel voor de Beschrijving of Locatie van één **Foto**. Een Suggestie mag een leeg, onaangeraakt veld zichtbaar voorinvullen, maar blijft herkenbaar als AI-voorstel en wordt nooit vanzelf een **Concept**, **Beschrijving** of **Locatie**. Alleen bewerken of expliciet goedkeuren maakt de voorgestelde waarde tot menselijke intentie.
_Avoid_: Concept, goedgekeurde metadata

**Concept**:
De duurzaam bewaarde, maar nog niet goedgekeurde bewerking van Beschrijving, Locatie en Oriëntatie voor één **Foto**. Ontstaat pas door een handeling van de curator; een onaangeraakte AI-suggestie is dus geen Concept. Een Concept mag tussen apparaten worden hervat, maar wordt nooit naar de **Bibliotheek** geschreven zonder expliciete goedkeuring.
_Avoid_: Suggestie, opgeslagen metadata

**Generatieopdracht**:
De begrensde opdracht om voor één versie van een **Foto** een nieuwe **Suggestie** te vragen. De opdracht kan slagen, niets bruikbaars opleveren, mislukken of worden geannuleerd zonder een bestaande Suggestie, een Concept of goedgekeurde metadata te veranderen.
_Avoid_: Suggestie, Goedkeuringsopdracht

**Goedkeuringsopdracht**:
De duurzame, onveranderlijke opdracht die ontstaat wanneer de curator de volledige zichtbare metadata-intentie voor één **Foto** expliciet goedkeurt. Zij bevat de volledige doelstaat van Beschrijving, Locatie en Oriëntatie; een ontbrekende Beschrijving of Locatie betekent verwijderen, niet ongewijzigd laten. De opdracht bewaakt de technische schrijfvoortgang; pas een geverifieerd geslaagde opdracht maakt de Foto afgehandeld.
_Avoid_: Concept, reviewstatus

**Locatie**:
De geografische plek waar een **Foto** is gemaakt, als latitude en longitude. Bron van waarheid is de **EXIF GPS-IFD** in het bestand; hoogte behoort niet tot de door de Curator beheerde Locatie. De **Fotoshow** leest Locatie voorlopig via het afgeleide Graph `location`-facet (`PhotoParser`, `item.location`). Optioneel — niet elke foto heeft een Locatie (~34% wél; zie `docs/research/gps-coverage.md`). Wordt toegekend op **Gebeurtenis**-niveau (één punt voor de hele map als default), met afwijking per **Foto** mogelijk.
_Avoid_: GPS, geotag, plaats

**Oriëntatie**:
De lossless weergavetransformatie van een **Foto**, uitgedrukt als één van de acht EXIF-Orientation-waarden. Een ontbrekende waarde betekent rechtop. De Curator draait de weergave linksom of rechtsom; de oorspronkelijke beeldpixels veranderen niet en een bestaande spiegeling blijft behouden.
_Avoid_: Pixels draaien, afbeelding opnieuw coderen

**Fotoshow**:
De schermvullende slideshow op de TV met onderschrift in beeld. Primair een gewone app die je handmatig opent; daarnaast óók als screensaver (DreamService) aangeboden, selecteerbaar waar het kastje dat toelaat. Zie ADR-0003.
_Avoid_: Screensaver, diashow

**Onderschrift**:
Het tekstblok over de foto. Twee delen: een **Kop** (altijd) en een **Beschrijving** (optioneel).
_Avoid_: Titel (te dubbelzinnig — gebruik Kop)

**Kop**:
De eerste regel van het onderschrift: gebeurtenis-naam + jaar (bijv. "Bruiloft Anne & Tom · 2019"). Altijd aanwezig. Het jaar komt uit de **jaar-map**, niet uit de EXIF-opnamedatum (die is onbetrouwbaar bij ingescande foto's). EXIF alleen als terugval.

**Hoofdmap**:
De map binnen de **Bibliotheek** die de Curator na het koppelen kiest als startpunt; de app toont en bewerkt uitsluitend díe tak. Eén tegelijk; een andere Hoofdmap kiezen is een expliciete reset van de gekoppelde Bibliotheek.
_Avoid_: Root, startmap

**Hervatpunt**:
De laatst geopende of na een beslissing eerstvolgende **Foto**, samen met het actieve reviewfilter. De **Beheer-webapp** bewaart per **Bibliotheek** één Hervatpunt om een sessie op een ander apparaat voort te zetten. Het is navigatiestaat, geen lock of reviewuitkomst.
_Avoid_: Lock, claim

**Herstelvereiste**:
De veiligheidsblokkade op een **Foto** wanneer een schrijfopdracht mogelijk bytes heeft gewijzigd, maar de **Beheer-webapp** niet kan bewijzen dat de volledige goedgekeurde doelstaat of de geverifieerde vorige versie aanwezig is. Alleen nieuwe byteverificatie kan de blokkade opheffen; een visuele bevestiging, conflictstatus of gewone retry volstaat niet.
_Avoid_: Fout, conflict, handmatig afgehandeld

**Beheer-webapp**:
De webapp (in `web/`, TanStack Start op Cloudflare) waarmee de vader zijn **Bibliotheek** cureert: interactief door foto's lopen die nog een **Beschrijving** of **Locatie** missen, AI-suggesties goedkeuren/overslaan, en handmatig bijsturen via een kaart. Kan ook scheef-staande foto's lossless rechtzetten via **Oriëntatie**. Schrijft de volledige goedgekeurde metadata-intentie via één geverifieerde, conditionele JPEG-vervanging terug naar OneDrive. Apart van de **Fotoshow** (de TV-app), maar op dezelfde **Bibliotheek**.
_Avoid_: Companion-app, admin-app

## Relationships

- De **Bibliotheek** ordent **Gebeurtenissen** per jaar en maand
- Een **Gebeurtenis** bevat meerdere **Foto's**
- Een **Foto** heeft optioneel één **Beschrijving**
- Een **Foto** heeft optioneel één **Locatie**; de default komt van de **Gebeurtenis**
- Een onzekere schrijfuitkomst kan een **Herstelvereiste** op een **Foto** plaatsen
- Het **Onderschrift** van een **Foto** = **Kop** (gebeurtenis + jaar) + optioneel de **Beschrijving**

## Observability

De app meldt fouten en de duur van de zware operaties (`index.crawl`, `index.delta`, login, Graph-calls)
aan **Sentry**, geïnitialiseerd in `ThrowbackApp`. Alle Sentry-aanroepen lopen via de `Telemetry`-façade.
Privacy-bewust: géén Session Replay (privé-familiefoto's), geen PII, en SAS-tokens worden uit
breadcrumb-URL's gestript. Zie ADR-0007.
