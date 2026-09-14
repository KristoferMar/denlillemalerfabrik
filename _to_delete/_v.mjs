import { shopifyGraphQL } from "./shopify-client.js";
const r=await shopifyGraphQL(`{ productVariants(first:30, query:"sku:DLM10-0126* OR sku:DLM20-0126* OR sku:DLM30-0126* OR sku:DLM50-0126*"){ edges{ node{ sku price product{handle} selectedOptions{name value} } } } }`);
for(const e of (r.productVariants??r.data.productVariants).edges) console.log(e.node.product.handle, e.node.sku, e.node.price, e.node.selectedOptions.map(o=>o.value).join(' '));
