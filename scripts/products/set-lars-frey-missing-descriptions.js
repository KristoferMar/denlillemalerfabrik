#!/usr/bin/env node
/**
 * Fills descriptions for the 6 Lars Frey accessory products that were
 * missing real copy (identified by audit-lars-frey-descriptions.js).
 *
 * Usage:
 *   node scripts/products/set-lars-frey-missing-descriptions.js --dry-run
 *   node scripts/products/set-lars-frey-missing-descriptions.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");

const UPDATES = [
  {
    handle: "skumvalse-ruller",
    html: `<p>Finporet skumrulle til glatte overflader: døre, låger, karme, paneler, radiatorer og metal. Giver en tyndere, glattere film end luvruller — ideel til træ- og metalmaling i højere glansgrader (glans 30–60), hvor penselstrøg og "appelsinhud" skal undgås. Egner sig bedst til tyndere, vandbaserede malinger.</p>`,
  },
  {
    handle: "gaffatape-premium-tape",
    html: `<p>Kraftig vævstape med stærk klæbeevne. Bruges til at samle og fastgøre afdækningsplast, dækpap på gulvet, plastfolie og afskærmninger — altså alt det, der skal sidde fast, mens der arbejdes. Ikke til afdækning direkte på malede flader eller fint træværk, da den river malingen af og efterlader limrester — brug malertape til det.</p>`,
  },
  {
    handle: "sandpapir-d421-50-m-slibepapir",
    html: `<p>Slibepapirrulle, 115 mm bred, til professionel brug og større opgaver. Fås i korn 40–240, så samme rulle dækker fra grovslibning (fjerne gammel maling, glatte træ, korn 40–80) til mellem- og finslibning mellem malingslag (korn 150–240). Økonomisk valg, når der slibes meget.</p>`,
  },
  {
    handle: "sandpapir-d421-5-m-slibepapir",
    html: `<p>Samme papir i mindre rulle til enkeltprojekter: slibning af paneler, karme, døre eller et enkelt rum. Korn 40–240.</p>`,
  },
  {
    handle: "sandpapir-d125-5-m-slibepapir",
    html: `<p>Slibepapirrulle, 115 mm × 5 m, korn 40–240. Alsidigt allround-papir til håndslibning af træ og spartlede flader før maling samt let mellemslibning mellem malingslag.</p>`,
  },
  {
    handle: "sandpapir-d126-2-m-slibepapir",
    html: `<p>Lille 2-meters rulle til små opgaver: udbedringer, finishslibning af et møbel, en dør eller en plet spartelmasse. Praktisk at have i værktøjstasken til "det-lille-ekstra"-arbejde.</p>`,
  },
];

const GET_PRODUCT = `
  query GetProduct($handle: String!) {
    productByHandle(handle: $handle) { id title handle }
  }
`;

const UPDATE_PRODUCT = `
  mutation UpdateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id handle }
      userErrors { field message }
    }
  }
`;

// Resolve all products first so we can fail early if any handle is wrong.
const plan = [];
for (const entry of UPDATES) {
  const data = await shopifyGraphQL(GET_PRODUCT, { handle: entry.handle });
  const product = data.productByHandle;
  if (!product) {
    plan.push({ ...entry, status: "NOT FOUND" });
    continue;
  }
  plan.push({ ...entry, status: "FOUND", id: product.id, title: product.title });
}

for (const entry of plan) {
  if (entry.status === "NOT FOUND") {
    console.log(`  ✗ ${entry.handle.padEnd(40)} NOT FOUND`);
  } else {
    console.log(`  ✓ ${entry.handle.padEnd(40)} → ${entry.title}`);
  }
}

const missing = plan.filter((p) => p.status === "NOT FOUND");
if (missing.length > 0) {
  console.error(`\n${missing.length} handle(s) not found. Aborting before any writes.`);
  process.exit(1);
}

if (DRY_RUN) {
  console.log(`\nDRY RUN — no writes. Sample HTML for ${plan[0].handle}:\n`);
  console.log(plan[0].html);
  console.log(`\nRe-run without --dry-run to apply.`);
  process.exit(0);
}

console.log(`\nApplying description updates…\n`);
let updated = 0;
for (const entry of plan) {
  const result = await shopifyGraphQL(UPDATE_PRODUCT, {
    input: { id: entry.id, descriptionHtml: entry.html },
  });
  const errors = result.productUpdate.userErrors;
  if (errors.length > 0) {
    console.error(`  ✗ ${entry.handle}: ${errors.map((e) => e.message).join("; ")}`);
    continue;
  }
  console.log(`  ✓ ${entry.handle}`);
  updated += 1;
  await sleep(200);
}

console.log(`\nDone. Updated ${updated}/${plan.length} products.`);
