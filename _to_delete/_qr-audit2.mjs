import { shopifyRest, shopifyGraphQL } from "./shopify-client.js";
const all=[]; let since=0;
while(true){const r=await shopifyRest(`redirects.json?limit=250&since_id=${since}`);const b=r.redirects??[];all.push(...b);if(b.length<250)break;since=b[b.length-1].id;}
console.log(JSON.stringify(all.map(r=>({path:r.path,target:r.target})),null,0));
