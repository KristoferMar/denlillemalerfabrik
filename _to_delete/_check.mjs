import { shopifyGraphQL } from "./shopify-client.js";
const r=await shopifyGraphQL(`{ productByHandle(handle:"vaegmaling-glans-5"){ options{name values} } }`);
const o=(r.productByHandle??r.data.productByHandle).options; console.log(JSON.stringify(o.map(x=>[x.name,x.values.length,x.values.filter(v=>/hvid/i.test(v))])));
