import { shopifyGraphQL } from "./shopify-client.js";
const pq=`query($after:String){ products(first:50, after:$after, query:"tag:paint OR tag:sortiment"){ pageInfo{hasNextPage endCursor} edges{ node{ id handle title tags } } } }`;
const vq=`query($id:ID!,$after:String){ product(id:$id){ variants(first:250, after:$after){ pageInfo{hasNextPage endCursor} edges{ node{ price selectedOptions{name value} } } } } }`;
let after=null, prods=[];
while(true){ const r=await shopifyGraphQL(pq,{after}); const p=r.products??r.data.products; prods.push(...p.edges.map(e=>e.node)); if(!p.pageInfo.hasNextPage) break; after=p.pageInfo.endCursor; }
const out=[];
for(const p of prods){ const sizes={}; let a=null;
  while(true){ const r=await shopifyGraphQL(vq,{id:p.id,after:a}); const v=(r.product??r.data.product).variants;
    for(const e of v.edges){ const so=Object.fromEntries(e.node.selectedOptions.map(o=>[o.name,o.value])); const size=so['Størrelse']||Object.values(so)[0]; const grp=so['Farve']? (so['Farve']==='Råhvid'?'Råhvid':'tonet') : 'single'; sizes[size]=sizes[size]||{}; sizes[size][grp]=sizes[size][grp]||new Set(); sizes[size][grp].add(+e.node.price); }
    if(!v.pageInfo.hasNextPage) break; a=v.pageInfo.endCursor; }
  out.push({handle:p.handle,title:p.title,tags:p.tags,sizes:Object.fromEntries(Object.entries(sizes).map(([k,g])=>[k,Object.fromEntries(Object.entries(g).map(([gk,s])=>[gk,[...s]]))]))});
}
console.log(JSON.stringify(out));
