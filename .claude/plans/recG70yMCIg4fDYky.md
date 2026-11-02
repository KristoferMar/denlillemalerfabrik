# Todo recG70yMCIg4fDYky — Newsletter foundation

**Airtable:** appeManNMBI7SRnus / tblc9pMzjs0qrlt5C / recG70yMCIg4fDYky
**Priority / Order:** P1 / 15
**Classification:** Hybrid (theme code + native Shopify customer form)

## Title
Vi skal have implementeret "nyhedsbrev foundation" som betyder at vi skal kunne display det på siden og indsamle emails på dem som signer op.

## User description
Jeg vil gerne have det her bliver håndteret direkte i shopify hvis det er muligt således at vires email database kommer til at ligge der.

## Refinements during planning
- **KME-styled section** (not Dawn's stock `newsletter.liquid` — which is absent in this theme anyway).
- Built on **Shopify's native `{% form 'customer' %}` Liquid tag**, so signups create real Shopify Customer records with `accepts_marketing=true`. No external ESP, no JS endpoint, no custom controller. Source: https://shopify.dev/docs/storefronts/themes/customer-engagement/email-consent.
- Placed **just above the footer on the main page only** (i.e. last section of `templates/index.json`, since the footer is rendered via `sections/footer-group.json` after the template sections). Not added to footer-group, so it does NOT appear on every page.

## Files changed
- `sections/kmeconsulting-newsletter.liquid` — new section. Uses `{% form 'customer' %}` with `name="contact[email]"`, hidden tag input `contact[tags]=newsletter,newsletter-home`, accessibility-correct error/success messages, scheme-aware styling, Danish defaults.
- `templates/index.json` — added `kmeconsulting_newsletter` to `sections` and appended it as the last entry in `order` so it renders directly above the footer-group.

## Verification before merge
- Theme editor → Home → confirm new "Nyhedsbrev" section appears just above the footer.
- Open homepage in browser → submit a test email → verify (a) success message renders inline, (b) Shopify admin → Customers shows a new customer with `Accepts marketing = Yes` and tag `newsletter`.
- Mobile breakpoint: input + button should stack vertically.

## Open items (out of scope for this todo)
- Enable double-opt-in in admin (Settings → Customer accounts → Email marketing) — recommended for DK/GDPR.
- Build the welcome email in Shopify Email targeted at tag `newsletter`.
- Optional: privacy policy link in `privacy_html` once a `/policies/privacy-policy` page is published.

## Caveats
- `templates/index.json` carries an auto-generated header comment ("may be updated by the Shopify admin theme editor"). The next theme-editor save will preserve this addition because the order array now contains the entry, but be aware editor reorders could move it.
- Commit on the working branch `v2` was made on top of an in-flight working tree (badeværelse image regeneration + product-finder.js edits). Only newsletter-related files were staged into the newsletter commit; everything else remains unstaged for the user to handle separately.
