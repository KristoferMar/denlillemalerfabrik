import { shopifyGraphQL } from "./shopify-client.js";
const pq=`query($after:String){ products(first:50, after:$after, query:"tag:paint OR tag:sortiment"){ pageInfo{hasNextPage endCursor} edges{ node{ id handle title tags productType options{name values} } } } }`;
const vq=`query($id:ID!,$after:String){ product(id:$id){ variants(first:250, after:$after){ pageInfo{hasNextPage endCursor} edges{ node{ title sku price compareAtPrice selectedOptions{name value} inventoryItem{unitCost{amount}} } } } } }`;
let after=null, prods=[];
while(true){ const r=await shopifyGraphQL(pq,{after}); const p=r.products??r.data.products; prods.push(...p.edges.map(e=>e.node)); if(!p.pageInfo.hasNextPage) break; after=p.pageInfo.endCursor; }
const out=[];
for(const p of prods){
  const sizes={}; let a=null, n=0;
  while(true){ const r=await shopifyGraphQL(vq,{id:p.id,after:a}); const v=(r.product??r.data.product).variants;
    for(const e of v.edges){ n++; const so=Object.fromEntries(e.node.selectedOptions.map(o=>[o.name,o.value])); const size=so['Størrelse']||so['Size']||e.node.title; const k=size; sizes[k]=sizes[k]||{prices:new Set(),costs:new Set(),n:0,sku:e.node.sku}; sizes[k].prices.add(+e.node.price); if(e.node.inventoryItem?.unitCost) sizes[k].costs.add(+e.node.inventoryItem.unitCost.amount); sizes[k].n++; }
    if(!v.pageInfo.hasNextPage) break; a=v.pageInfo.endCursor; }
  out.push({handle:p.handle,title:p.title,tags:p.tags,type:p.productType,variants:n,sizes:Object.fromEntries(Object.entries(sizes).map(([k,v])=>[k,{prices:[...v.prices],costs:[...v.costs],n:v.n,sku:v.sku}]))});
}
console.log(JSON.stringify(out));
