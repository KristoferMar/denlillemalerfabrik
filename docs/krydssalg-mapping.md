# Krydssalg – mapping fra regelsæt til produkter (1. oktober 2026)

Reglerne fra `produktsammensaetninger.md` er lagt i Shopify som metaobjekter af typen
**Krydssalgsregel** (Indhold → Metaobjekter). Temaet viser dem på produktsiden under
købsknappen via blokken `blocks/kmeconsulting-krydssalg.liquid`.

Sådan virker det:

- En regel udløses, hvis produktet har ét af tags'ene i *Udløses af tags* **eller** er
  et af produkterne i *Udløses af produkter*.
- Rammer flere regler samme produkt, lægges forslagene sammen i reglernes *Rækkefølge*,
  og hvert tilbehør vises kun én gang.
- Produktet selv, udsolgte varer og kladder vises aldrig.
- *Aktiv* = fra pauser en regel uden at slette den.
- Rækkefølgen inde i *Forslag* er rækkefølgen på siden. De første 6 vises, resten
  bag "Vis N mere" (tallet kan ændres i theme-editoren på blokken).

## Hvad reglerne udløses af

| Regel | Tags | Produkter |
|---|---|---|
| 1 Væg- og loftmaling | paint-type:vaegmaling, paint-type:loftmaling | – |
| 2 Lakfarve glans 40 | paint-type:trae-og-metal | Universalmaling Halvblank |
| 3 Sandspartel | danalim-kategori:sandspartel | Rullespartel 627, Rullespartel – Ergospartel, Fibergipsspartel 630 |
| 4 Whiteboard Paint | whiteboardmaling | – |
| 5 Glasfilt | danalim-kategori:glasfilt | – |
| 6 Alle vægmalinger + panelmaling | paint-type:vaegmaling, paint-type:loftmaling | Træ & Metal Glans 40 |
| 7 Træbeskyttelse | paint-type:traebeskyttelse | – |

Bemærk: regel 1 og 6 rammer de samme malinger. Det er bevidst – de flettes, og dubletterne
forsvinder. Vil I slå dem sammen til én regel, gøres det i admin.

## Mapping der skal tjekkes af Lars

Navnene i regelsættet er oversat til det nærmeste produkt i butikken. Dem markeret **?** er
et gæt mellem flere muligheder – ret dem i reglen i admin (produktvælgeren).

| I regelsættet | Valgt produkt | Bemærkning |
|---|---|---|
| Rullespand – 12 L | Rullespand \| Bakker | |
| Jumbopind – 50 mm | Jumbopensel \| Mix **?** | Findes også som ECO, Soft og kort skaft |
| Rulleposer / Rulleplastik | Rullespandposer | Samme produkt for begge |
| Afdækningspap | Papir-Mask \| Afdækning | |
| Afdækningsplast | Folie-Mask \| Afdækning **?** | Alternativ: Washi Folie-Mask, Selvklæbende plastikfolie |
| Tape – 30 mm | Masking tape standard \| Tape **?** | Varianter 24/36/48 mm – ingen 30 mm. Alternativ: Washi Tape Premium |
| Rulle – 25 cm + skaft | Glatlak rulle 18-25 cm + Håndtag 15-25 cm | To produkter |
| Rulle – 15 cm + skaft | Glatlak rulle 5-15 cm + Håndtag 10 cm | To produkter. Der findes to "Håndtag 10 cm" – den første er valgt |
| Teleskopskaft | Forlængerskaft | |
| Polyfiller (til huller) | Filler Indendørs 611 **?** | Alternativ: Filler Standard 618, Quick Filler 614 |
| Sandpapir korn 100 / korn 50 | Sandpapir D421, 5 m **?** | Kornstørrelse vælges som variant. Seks sandpapir-produkter at vælge imellem |
| Pensel til træværk 25/35/45 mm | Fladpensel \| Mix **?** | Størrelser er varianter. Alternativ: Fladpensel \| Gemini |
| Stikpensel 15 mm | Stickpensel \| Syntetisk **?** | Mindste variant er 20 mm |
| Træværkspartel | Træfiller 617 **?** | Alternativ: Plastisk Træ 638 |
| Fugemasse | Acryl Extra 505 Hvid **?** | Alternativ: Budget Acrylfugemasse 501, Danaseal Interior 521 |
| Fugepistol | Fugepistol D-881 **?** | Alternativ: D-883 Metal, Håndfugepistol H-14/H-40 |
| Spartel 10/15/35/45 cm | Spartel (9 varianter) + Japan spartelsæt | |
| Papirstrimmel | Sparteltape 970 | |
| Forankringsgrunder | Microdispers Grunder Blå **?** | Alternativ: Microdispers Grunder Hvid |
| Vævlim | Vævlim 212 **?** | Alternativ: Vævlim Ekstra 214 |
| Husrens | Husrens 1:10 Koncentreret | |
| Tom spand – 10 L | Plastspand **?** | Varianter 10/15/25 l |
| Italiensk pensel 3×10 / 3×7 | Ovalpensel \| Soft + Ovalpensel \| Gemini **?** | Ingen "italiensk pensel" i butikken – ovalpensel er nærmeste |
| Lang knækpensel 35 mm | Radiatorpensel \| Natur **?** | |
| WO Tools penselsæt | Penselsæt (40-100 mm) **?** | Seks produkter hedder "Penselsæt" – den første er valgt |
| Miracle-handsker | VEGA arbejdshandsker hvid **?** | Lagt i whiteboard-reglen |

## Findes ikke i butikken (13) – ikke med i reglerne

Toolbox kit · Whiteboard markers 14 stk. · Whiteboard Colors Wetwipe · Chalk markers 8 stk. ·
Klude 10 stk. · Klude 2 stk. · Norman Copenhagen Organizer str. 1–4 (4 stk.) · Algerens ·
Rundpensler · Gulvskrubber / skrubber til afvaskning

Whiteboard-reglen (4) har derfor kun to forslag lige nu: Vægmaling Glans 10 og handsker.
Når tilbehøret oprettes som produkter, tilføjes de i reglen i admin.

## Sådan tilføjes en ny regel

Indhold → Metaobjekter → Krydssalgsregel → Tilføj post. Udfyld navn, sæt Aktiv, giv et
rækkefølgetal (10, 20, 30 …), skriv de tags, der skal udløse reglen (fx `paint-type:gulvmaling`),
og vælg forslagene med produktvælgeren. Reglen virker med det samme – ingen push.
