#!/usr/bin/env node
import { shopifyGraphQL } from "./shopify-client.js";

const data = await shopifyGraphQL(`
  {
    currentAppInstallation {
      accessScopes { handle }
    }
  }
`);

const scopes = data.currentAppInstallation.accessScopes
  .map((s) => s.handle)
  .sort();

console.log("Current token scopes:\n");
for (const s of scopes) console.log(`  ${s}`);
console.log(`\nTotal: ${scopes.length}`);
