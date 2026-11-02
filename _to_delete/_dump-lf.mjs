import { shopifyGraphQL } from "./shopify-client.js";
const q=`query($after:String){ products(first:50, after:$after, query:"tag:'Lars Frey'"){ pageInfo{hasNextPage endCursor} edges{ node{ handle title tags productType variants(first:50){ edges{ node{ title sku price compareAtPrice inventoryItem{ unitCost{ amount } } } } } } } } }`;
let after=null, out=[];
while(true){ const r=await shopifyGraphQL(q,{after}); const p=r.products??r.data?.products; for(const e of p.edges){ const n=e.node; out.push({handle:n.handle,title:n.title,tags:n.tags,type:n.productType,variants:n.variants.edges.map(v=>({title:v.node.title,sku:v.node.sku,price:+v.node.price,compare:v.node.compareAtPrice,cost:v.node.inventoryItem?.unitCost?.amount??null}))}); } if(!p.pageInfo.hasNextPage) break; after=p.pageInfo.endCursor; }
console.log(JSON.stringify(out));
