# Konfigurer en behandling i malerberegneren

Beregneren består af to filer:

- `snippets/beregner-config.liquid` — al data: behandlinger, produkter, forbrug
- `sections/maler-beregner.liquid` — UI og beregningslogik

Skal en behandling rettes, sker det normalt kun i config-filen.

## Felter pr. behandling

| Felt | Betydning |
|---|---|
| `name` | Vises som overskrift på resultatet |
| `category` | `indvendigt` / `udvendigt` — styrer ikon og label |
| `coverage_m2_per_liter` | Vises i headeren (m²/L). Bruges ikke i selve udregningen |
| `coats` | Antal lag. Vises som badge både ved arealindtastning og på resultatet |
| `note` | Valgfri. Forklarende tekst i grøn boks over produktlisten |
| `steps` | Valgfri. Nummereret arbejdsgang under `note` |

## Felter pr. produkt

| Felt | Betydning |
|---|---|
| `handle` | Shopify product handle. `TODO-...` betyder "produkt mangler" |
| `role` | `primer` / `paint` / `tool` / `accessory` — styrer farvet type-mærkat |
| `label` | Tekst der vises, hvis produktet ikke findes i Shopify |
| `per_m2` | Forbrug pr. m² **pr. lag**. 0 = fast antal |
| `flat_qty` | Fast antal uanset areal (bruges når `per_m2` er 0) |
| `unit` | Enhed i visningen. Standard `L` ved `per_m2`, `stk` ved `flat_qty`. Også `m` og `kg` |
| `apply_coats` | `false` = ganges **ikke** med antal lag. Bruges til filt, lim, spartel og tape, der kun lægges på én gang. Standard `true` |
| `pack_size` + `pack_unit` | Valgfri. Omregner mængden til hele pakker: `440 m` → `18 ruller à 25 m` |
| `variant` | Valgfri. Varianttitel der skal vælges i stedet for den første, fx `50mm` eller `15 kg` |

Rækkefølgen af produkter i JSON'en er den rækkefølge, de vises i — materialer
først, værktøj sidst.

## Sådan regnes der

```
mængde = areal × per_m2 × (apply_coats ? coats : 1)
```

Rundes op til én decimal. Med `pack_size` vises desuden antal hele pakker.
For produkter der ganges med lag, vises en ekstra linje: `100 L pr. lag × 2 lag`.

## Eksempel: Ny gips – væg

`coverage_m2_per_liter: 4`, `coats: 2`, og 0,25 L/m² for både grunder og maling.
Grunderen sættes kun på én gang (`apply_coats: false`), malingen i 2 lag.
400 m² giver:

| Produkt | Mængde |
|---|---|
| Strimmel (Sparteltape 970) | 200 m (3 ruller à 75 m) |
| Sandspartel Medium | 40 L |
| Glasfilt 1. sort. | 440 m (18 ruller à 25 m) |
| Vævlim 212 | 100 kg |
| Microdispersgrunder | 100 L (grundes kun én gang, `apply_coats: false`) |
| Vægmaling Glans 10 | 200 L (100 L pr. lag × 2 lag) |
| Rulle, håndtag, rullespand, jumbopensel 50 mm | 1 stk. hver |
| Malertape, afdækningsfolie, sandpapir | 1 stk. hver |

Glasfilt regnes som 1,1 løbende meter pr. m² (1 m bred bane + ca. 10 % spild).

## Åbne punkter

- **Kurven lægger stykantal i, ikke liter.** 100 L grunder bliver til 100 ×
  "Microdispersgrunder 2,5 L" i kurven, altså 250 L. Mængde skal omregnes til
  antal spande af den valgte størrelse, før "Læg alle produkter i kurven" er
  brugbar på store arealer.
- **Maling vælger en tilfældig farve.** `vaegmaling-glans-10` har varianter som
  `Isklar / 3L`, så beregneren viser første farve i rækken. Brugeren bør vælge
  farve og spandstørrelse.
- **Sandspartel Medium står til 0,00 kr.** i Shopify.
- Forbrugstallene for strimmel (0,5 m/m²), sandspartel (0,1 L/m²) og vævlim
  (0,25 kg/m²) er estimater og bør bekræftes fagligt.
