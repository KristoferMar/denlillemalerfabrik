import { shopifyGraphQL, sleep } from "./shopify-client.js";
import { writeFileSync } from "node:fs";
const DRY = process.argv.includes("--dry-run");
// handle -> { sizeKey: [råhvidPrice, tintedPrice] }  (same value twice = one price for all colours)
const COLOUR = {
  "vaegmaling-glans-5":  { "1L":[199,229], "3L":[399,449], "5L":[699,699], "10L":[1099,1199] },
  "vaegmaling-glans-10": { "1L":[229,249], "3L":[529,529], "5L":[749,849], "10L":[1249,1349] },
  "loftmaling-glans-1":  { "1L":[189,189], "3L":[329,329], "5L":[599,599], "10L":[999,999], "12L":[1149,1149] },
  "loftmaling-glans-5":  { "1L":[189,189], "3L":[329,329], "5L":[599,599], "10L":[999,999], "12L":[1149,1149] },
  "trae-metal-glans-40": { "1L":[299,349], "3L":[649,699] },
  "traebeskyttelse-glans-20": { "5L":[749,899], "10L":[1699,1699] },
};
const SINGLE = {
  "vaegmaling-kokken-bad-glans-25": { "3 L":599, "5 L":799, "10 L":1499 },
  "microdispers-blatonet-inde-ude": { "10 L":399 },
  "microdispers-microgrunder-hvidpigmenteret": { "10 L":499 },
  "grundingsolie-vandig": { "5 L":299, "10 L":549 },
  "alkyd-trae-grundingsolie": { "5 L":399, "20 L":1499 },
  "tag-facademaling": { "10 L":1199 },
  "tag-facademaling-glans-20": { "10 L":1199 },
  "tagmaling-glans-10": { "20 L":2199 },
  "tagmaling-glans-20-sort-glans-60": { "20 L":2199 },
  "tagmaling-aluminium-glans-60": { "20 L":2199 },
  "mur-facademaling-akryl-olie": { "5 L":799, "10 L":1499 },
  "tag-sokkelmaling": { "5 L":799 },
  "traebeskyttelse-heldaekkende-vandig": { "5 L":749 },
  "traebeskyttelse-heldaekkende-alkyd-olie": { "2,5 L":699, "5 L":749 },
  "traeterrasseolie-olie-baseret": { "5 L":499 },
  "pu-gulvlak": { "10 L":1599 },
  "husrens-plus-9-9": { "5 L":299 },
};
const vq=`query($id:ID!,$after:String){ product(id:$id){ variants(first:250, after:$after){ pageInfo{hasNextPage endCursor} edges{ node{ id price selectedOptions{name value} } } } } }`;
const mut=`mutation($pid:ID!,$vs:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$pid, variants:$vs){ productVariants{ id } userErrors{ field message } } }`;
const log=[]; let total=0, changed=0;
async function product(handle){ const r=await shopifyGraphQL(`{ productByHandle(handle:"${handle}"){ id } }`); return (r.productByHandle??r.data.productByHandle).id; }
async function variants(id){ const out=[]; let after=null; while(true){ const r=await shopifyGraphQL(vq,{id,after}); const v=(r.product??r.data.product).variants; out.push(...v.edges.map(e=>e.node)); if(!v.pageInfo.hasNextPage) break; after=v.pageInfo.endCursor; } return out; }
async function apply(pid, updates, handle){
  for(let i=0;i<updates.length;i+=250){ const chunk=updates.slice(i,i+250); if(DRY) continue;
    const r=await shopifyGraphQL(mut,{pid,vs:chunk}); const res=r.productVariantsBulkUpdate??r.data.productVariantsBulkUpdate;
    if(res.userErrors.length){ console.error(handle, JSON.stringify(res.userErrors)); process.exit(1); } await sleep(300); }
}
for(const [handle,sizes] of Object.entries(COLOUR)){
  const pid=await product(handle); const vs=await variants(pid); const updates=[]; const summary={};
  for(const v of vs){ const so=Object.fromEntries(v.selectedOptions.map(o=>[o.name,o.value])); const size=so["Størrelse"]; const spec=sizes[size]; if(!spec) continue;
    const isRaa = so["Farve"]==="Råhvid"; const np=isRaa?spec[0]:spec[1]; total++;
    if(+v.price!==np){ updates.push({id:v.id,price:np.toFixed(2)}); changed++; const k=`${size} ${isRaa?"Råhvid":"tonet"}`; summary[k]=summary[k]||{from:new Set(),to:np,n:0}; summary[k].from.add(+v.price); summary[k].n++; } }
  await apply(pid,updates,handle);
  log.push({handle, updated:updates.length, summary:Object.fromEntries(Object.entries(summary).map(([k,v])=>[k,`${[...v.from].join("/")} → ${v.to} (${v.n})`]))});
}
for(const [handle,sizes] of Object.entries(SINGLE)){
  const pid=await product(handle); const vs=await variants(pid); const updates=[]; const summary={};
  for(const v of vs){ const so=Object.fromEntries(v.selectedOptions.map(o=>[o.name,o.value])); const size=so["Størrelse"]||so["Size"]||Object.values(so)[0]; const np=sizes[size]; if(np==null) continue; total++;
    if(+v.price!==np){ updates.push({id:v.id,price:np.toFixed(2)}); changed++; summary[size]=`${v.price} → ${np}`; } }
  await apply(pid,updates,handle);
  log.push({handle, updated:updates.length, summary});
}
console.log(JSON.stringify({dry:DRY,total,changed,log},null,1));
