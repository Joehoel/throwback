# Research: AI-modellen voor locatiebepaling uit foto's

Status: **onderzoek afgerond** · Datum: 2026-06-06

## Aanleiding

Verkenning van AI-modellen die een locatie kunnen *raden* uit een foto (geen EXIF-GPS, puur op
beeld: architectuur, vegetatie, borden, terrein). Relevant voor foto's zonder GPS — ~66% van de
index heeft geen locatie (zie [`gps-coverage.md`](./gps-coverage.md)). De vraag: welk model is goed
genoeg, en wat kost het om de hele backlog (~20.000 foto's) te verwerken?

## Korte conclusie

**Gemini 2.5 Pro is de accuratesse/prijs-winnaar; Flash de volume-keuze; sla GPT-5 over.** Voor de
~20k-batch is **Gemini 2.5 Flash de juiste keuze: realistisch ~$22**. Specialist-tool **GeoSpy**
geeft meter-precisie maar kost ~$1.000 voor dezelfde batch (~45×) en is toegang-gated.

Belangrijke nuance: benchmarks tonen *best-case*. Bellingcat's praktijktests laten zien dat zelfs het
beste model regelmatig zelfverzekerd de verkeerde locatie geeft. Behandel output als *lead om te
verifiëren* (Street View, Lens, kaart), nooit als grondwaarheid.

## Twee categorieën

| | Specialist-modellen | Algemene multimodale LLM's |
|---|---|---|
| Voorbeelden | GeoSpy, PIGEON/PIGEOTTO | Gemini, GPT-5, Claude, Grok |
| Precisie | meter-niveau (op markante scenes) | km-niveau |
| Toegang | gated / enterprise | gewone API |
| Kosten | hoog, flat per beeld | laag, per token |

## Accuratesse vs. prijs vs. snelheid

Accuratesse uit de academische **GeoBench / "From Pixels to Places"** benchmark (mediane
afstandsfout — lager = beter), gekoppeld aan actuele API-prijzen en gemeten doorvoer.

| Model | Mediane fout | Prijs (in / uit per 1M tok) | Snelheid | Geschat per foto |
|---|---|---|---|---|
| **Gemini 2.5 Pro** | **0,80 km** 🥇 | $1,00 / $10 | 143 t/s | ~$0,005–0,01 |
| **Gemini 2.5 Flash** | 1,67 km | $0,30 / $2,50 | 225 t/s | ~$0,001–0,003 |
| **GPT-5** | 1,86 km | $1,25 / $10 | traag (~58 t/s) | ~$0,005–0,01 |
| **Gemini 2.5 Flash-Lite** | (ongetest, zwakst) | $0,05 / $0,20 | 215–887 t/s ⚡ | ~$0,0003 |
| **GeoVista-7B** (open) | 2,35 km (beste open-source) | self-host | GPU-afhankelijk | infra |
| **GeoSpy Pro** (specialist) | meter-niveau | $499/mnd (10k lookups) | seconden/foto | **$0,05** flat |

Bevindingen:
- **GPT-5 is de slechtste waarde**: zelfde outputprijs als Gemini Pro, maar minder accuraat én
  trager. Academische benchmark én Bellingcat zijn het eens dat GPT-5 *regresseerde* op geolocatie.
- **"Thinking"-modes schaden geolocatie**: meerdere tests vonden dat extended-thinking de
  accuratesse *verlaagt* én de outputkosten opblaast. Voor deze taak: uit laten staan — goedkoper én
  beter.
- **Google AI Mode** (Gemini-gebaseerd) was in Bellingcat's praktijktest het sterkst van alles,
  beter dan Google Lens en alle GPT-modellen.

## Kostenberekening — 20.000 foto's op Gemini 2.5 Flash

Prijs: $0,30/M input, $2,50/M output. Output domineert (8× duurder dan input).

| Scenario | In/foto | Uit/foto | Input $ | Output $ | **Totaal** |
|---|---|---|---|---|---|
| **Lean** (≤768px, no thinking, terse) | 750 | 100 | $4,50 | $5,00 | **$9,50** |
| **Realistisch** (multi-tile, korte redenering) | 1.200 | 300 | $7,20 | $15,00 | **$22,20** |
| **Heavy** (grote img, thinking AAN) | 1.500 | 1.500 | $9,00 | $75,00 | **$84,00** |

Realistisch per foto: **$0,00111** → **$22,20** voor 20k.

Ter vergelijking:
- **GeoSpy** flat $0,05/foto → **$1.000** (~45× duurder)
- **Flash-Lite** → **$1,15–$2,40** (bijna gratis, maar zwakste model — eerst piloten)

Grootste hefboom: **thinking uit + antwoorden terse** — het verschil tussen $22 en $84. En
**downscalen** (lange zijde ≤768px) halveert de input-tokens.

### Reproduceerbaar script

```python
IN_PRICE  = 0.30 / 1_000_000   # Gemini 2.5 Flash input
OUT_PRICE = 2.50 / 1_000_000   # Gemini 2.5 Flash output
N = 20_000

scenarios = {
    "Lean":        (750, 100),
    "Realistisch": (1200, 300),
    "Heavy":       (1500, 1500),
}
for name, (tin, tout) in scenarios.items():
    total = N * (tin * IN_PRICE + tout * OUT_PRICE)
    print(f"{name:<12} ${total:,.2f}")
```

## Aanbeveling voor Throwback

1. **Pilot** op een sample van ~100 foto's zonder GPS met **Gemini 2.5 Flash**, thinking uit,
   gestructureerde output (land + plaats + lat/long + confidence). Meet echte tokencounts.
2. Bij voldoende kwaliteit: hele backlog via Flash, budget **~$20–25**.
3. **Confidence-drempel** hanteren: alleen suggesties tonen/opslaan boven een zekerheidsgrens; lage
   confidence = niet invullen (model raadt liever fout dan niets).
4. Locatie blijft een *suggestie ter verificatie*, niet automatisch geschreven als waarheid. Sluit
   aan op [ADR 0008](../adr/0008-locatie-via-exif-gps-re-upload.md).

## Bronnen

- [From Pixels to Places — geolocatie-benchmark (arXiv)](https://arxiv.org/pdf/2508.01608) ·
  [Epoch AI — GeoBench](https://epoch.ai/benchmarks/geobench)
- [Bellingcat — GPT-5 performs worse than other models](https://www.bellingcat.com/resources/2025/08/14/llms-vs-geolocation-gpt-5-performs-worse-than-other-ai-models/) ·
  [Bellingcat — Have LLMs Finally Mastered Geolocation?](https://www.bellingcat.com/resources/how-tos/2025/06/06/have-llms-finally-mastered-geolocation/)
- [GIJN — Updated Test of 24 LLMs for Geolocation](https://gijn.org/stories/updated-test-24-llms-ai-geolocation/)
- [Gemini API pricing (Google)](https://ai.google.dev/gemini-api/docs/pricing) ·
  [Gemini 2.5 Flash speed/price (Artificial Analysis)](https://artificialanalysis.ai/models/gemini-2-5-flash)
- [GeoSpy AI](https://geospy.ai/) · [GeoSpy API docs](https://dev.geospy.ai/docs/api)
- [PIGEON: Predicting Image Geolocations](https://lukashaas.github.io/PIGEON-CVPR24/)
