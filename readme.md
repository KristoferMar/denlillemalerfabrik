
shopify theme list

shopify theme push --theme 187606696322 --store den-lille-malerfabrik.myshopify.com

## Run dev 
shopify theme dev --store den-lille-malerfabrik.myshopify.com --theme 187606696322
  ---
  Pages
  ┌────────────────────────────────────┬───────────────────────────────┬─────────────────────────────┐
  │             Your term              │          What it is           │            File             │
  ├────────────────────────────────────┼───────────────────────────────┼─────────────────────────────┤
  │ Forsiden (Front page)              │ The homepage/landing page     │ templates/index.json        │
  ├────────────────────────────────────┼───────────────────────────────┼─────────────────────────────┤
  │ Produktsiden (Product page)        │ Individual product view       │ templates/product.json      │
  ├────────────────────────────────────┼───────────────────────────────┼─────────────────────────────┤
  │ Kollektionssiden (Collection page) │ Product listing/category page │ templates/collection.json   │
  ├────────────────────────────────────┼───────────────────────────────┼─────────────────────────────┤
  │ Kurvsiden (Cart page)              │ Shopping cart                 │ templates/cart.json         │
  ├────────────────────────────────────┼───────────────────────────────┼─────────────────────────────┤
  │ Infosiden (Generic page)           │ Standard content page         │ templates/page.json         │
  ├────────────────────────────────────┼───────────────────────────────┼─────────────────────────────┤
  │ Kontaktsiden (Contact page)        │ Contact form page             │ templates/page.contact.json │
  ├────────────────────────────────────┼───────────────────────────────┼─────────────────────────────┤
  │ Blogindlæg (Blog post)             │ Single blog article           │ templates/article.json      │
  ├────────────────────────────────────┼───────────────────────────────┼─────────────────────────────┤
  │ Søgesiden (Search page)            │ Search results                │ templates/search.json       │
  └────────────────────────────────────┴───────────────────────────────┴─────────────────────────────┘
  ---
  Global elements (on every page)
  ┌──────────────┬─────────────────────────────────────────────────────────────────┐
  │  Your term   │                           What it is                            │
  ├──────────────┼─────────────────────────────────────────────────────────────────┤
  │ Annoncebaren │ The top bar ("Welcome to our store")                            │
  ├──────────────┼─────────────────────────────────────────────────────────────────┤
  │ Headeren     │ Logo + navigation menu + search + language selector             │
  ├──────────────┼─────────────────────────────────────────────────────────────────┤
  │ Footeren     │ Email signup ("Join our email list") + copyright + social links │
  └──────────────┴─────────────────────────────────────────────────────────────────┘
  ---
  Forsiden — sections top to bottom
  Your term: Heroen
  What it is: Big banner image at the top
  Current content: Text: "Browse our latest products" + "Shop all" button
  ────────────────────────────────────────
  Your term: Produktgitter 1
  What it is: First product grid
  Current content: Tagline: "Professionel maling. Korrekt resultat." + "Køb nu" + "Beregn korrekt mængde"
    buttons, 8 products, 4 columns
  ────────────────────────────────────────
  Your term: Produktgitter 2
  What it is: Second product grid
  Current content: Dynamic collection title + "View all" link, 8 products, 4 columns
  ---
  Produktsiden — sections top to bottom
  Your term: Produktgalleri
  What it is: Product images (grid layout, zoomable)
  ────────────────────────────────────────
  Your term: Produktdetaljer
  What it is: Right column: title, price, variant picker, buy buttons (add to cart + accelerated checkout),
    description
  ────────────────────────────────────────
  Your term: Anbefalinger
  What it is: "You may also like" — 4 related products in a grid
  ---
  Kollektionssiden — sections top to bottom
  ┌───────────────────────┬──────────────────────────────────┐
  │       Your term       │            What it is            │
  ├───────────────────────┼──────────────────────────────────┤
  │ Kollektionsoverskrift │ Collection title + description   │
  ├───────────────────────┼──────────────────────────────────┤
  │ Produktgitter         │ Filterable/sortable product grid │
  └───────────────────────┴──────────────────────────────────┘
  ---
  Kurvsiden — sections top to bottom
  ┌───────────────────┬─────────────────────────────────────────────────┐
  │     Your term     │                   What it is                    │
  ├───────────────────┼─────────────────────────────────────────────────┤
  │ Kurven            │ Cart title, line items, and order summary       │
  ├───────────────────┼─────────────────────────────────────────────────┤
  │ Kurv-anbefalinger │ "You may also like" — 4 products below the cart │
  └───────────────────┴─────────────────────────────────────────────────┘
  ---
  Building blocks (reusable terms)

  These are smaller elements that appear inside sections. You can combine them with a page/section name:
  ┌───────────────┬──────────────────────────────────────────────────────────────────┐
  │   Your term   │                          What it means                           │
  ├───────────────┼──────────────────────────────────────────────────────────────────┤
  │ Knap (button) │ A clickable button (primary style = filled, secondary = outline) │
  ├───────────────┼──────────────────────────────────────────────────────────────────┤
  │ Tekst         │ A text/heading block                                             │
  ├───────────────┼──────────────────────────────────────────────────────────────────┤
  │ Produktkort   │ A single product card (image + title + price)                    │
  ├───────────────┼──────────────────────────────────────────────────────────────────┤
  │ Divider       │ A horizontal line separator                                      │
  ├───────────────┼──────────────────────────────────────────────────────────────────┤
  │ Variantvælger │ Size/color/option picker on product page                         │
  ├───────────────┼──────────────────────────────────────────────────────────────────┤
  │ Købsknapper   │ The add-to-cart + quick checkout button group                    │
  ├───────────────┼──────────────────────────────────────────────────────────────────┤
  │ Filtre        │ Collection page filter/sort controls                             │
  ├───────────────┼──────────────────────────────────────────────────────────────────┤
  │ Email signup  │ Newsletter subscription form                                     │
  └───────────────┴──────────────────────────────────────────────────────────────────┘
  ---
  Example usage: "On Forsiden, in Produktgitter 1, change the Køb nu knap to link to X" — and I'll know
  exactly what to edit.

  Want me to adjust any of these terms, or add anything?