# Prisliste — Den Lille Malerfabrik

Fuld udtrækning af alle produkter og varianter med priser fra Shopify Admin API.

- **Udtrukket:** 31. august 2026
- **Regneark:** [`prisliste.xlsx`](./prisliste.xlsx)
- **Rådata:** [`price-list.json`](./price-list.json)
- **Genskabes med:** `node scripts/products/export-price-list.js`

## Nøgletal

| | |
|---|---|
| Produkter | 230 (alle ACTIVE) |
| Varianter | 7.006 |
| Unikke pris/størrelse-kombinationer | 542 |
| Laveste pris (over 0) | 2,00 kr. |
| Højeste pris | 2.875,00 kr. |
| Gennemsnitspris (over 0) | 291,31 kr. |
| Varianter uden pris (0,00 kr.) | 20 |
| Varianter uden SKU | 148 |

### Pr. leverandør

| Leverandør | Produkter | Varianter |
|---|---|---|
| Lars Frey Farve og Lak | 108 | 304 |
| Den Lille Malerfabrik | 62 | 6.611 |
| Danalim | 60 | 91 |

Den Lille Malerfabrik står for 94 % af varianterne, fordi malinglinjens seks
produkter hver har 217 farver × 4 størrelser.

## Fanebladene

| Faneblad | Rækker | Indhold |
|---|---|---|
| **Oversigt** | — | Nøgletal og opdelinger. Alle tal er formler, der peger på de øvrige faneblade, så de følger med, hvis data rettes. |
| **Produkter** | 230 | Én række pr. produkt: type, leverandør, status, antal varianter, prisinterval, optioner, tags. |
| **Alle varianter** | 7.006 | Den fulde udtrækning: farve, størrelse, SKU, pris, før-pris, lager. |
| **Priser pr. størrelse** | 542 | Sammenfattet visning. Malingprodukterne har samme pris for alle 217 farver, så denne fane viser hver unik størrelse/pris-kombination i stedet for 868 næsten ens rækker — den hurtigste vej til "hvad koster 10 L af X?". |

Alle faneblade har autofilter og fastfrosne overskrifter.

## Fund værd at kigge på

### 20 varianter står til 0,00 kr.

De er købbare til nul kroner, hvis de er publiceret. Fordeler sig på:

- **Sortiment / vægbeklædning:** Glasfilt (25 m, 50 m), Glasvæv (25 m, 50 m),
  Magnetisk filt Mag+ (alle tre), Rutex savsmuldstapet, Vævlim (3 L, 12 L)
- **Spartelmasser:** Sandspartel Fin (5 L, 10 L), Sandspartel Medium (10 L),
  Letspartel Finish (5 L), Vådrumsspartel (10 L)
- **Maling:** Loft- & vægmaling Glans 5 (alle tre størrelser),
  Vægmaling Køkken & Bad Glans 25 (5 L)
- **Afdækning:** Selvklæbende 50 my plastikfolie (1000 mm)

Bemærk at `Vægmaling Køkken & Bad Glans 25` har pris på 3 L (375 kr.) og 10 L
(900 kr.), men 0 kr. på 5 L — det ligner en manglende indtastning snarere end
et bevidst valg.

### 148 varianter uden SKU

Primært sortiment- og Danalim-produkter. Malinglinjens varianter har alle SKU
efter mønsteret `DLM{type}-{farve}-G{glans}-{størrelse}`.

### Prisspændet

Billigste vare er slibemateriale (Rondel D323, 2,00 kr. pr. stk.), dyreste er
LF-Epoxy Primer 15 kg sæt til 2.875,00 kr.

## Om udtrækningen

Scriptet `scripts/products/export-price-list.js` paginerer både produkter og
varianter. Det eksisterende `export-all-products.js` henter kun `variants(first: 100)`
uden paginering og ville derfor afkorte alle malingprodukter med 868 varianter —
brug det nye script til pris- og variantdata.
