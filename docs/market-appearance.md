# Layu Market appearance

The shared site shell implements the approved [B v2 reference](../outputs/header-background-concepts/B-quiet-gallery-light-dark-v2.png) and the requested gaming-focused background rotation. Header, page margins, and footer use one continuous warm stone / blue charcoal ground. The small upper-left wordmark is removed; the large object-letter masthead and live footer brand remain.

## Page behavior

- The same LAYU MARKET masthead appears across the site. Account, admin, sign-in, verification, and purchase forms use a smaller masthead and suppress nearby decorative props.
- Six composed arrangements combine vintage finds, retro consoles, arcade objects, handhelds, game-night equipment, and collector objects. The initial set has no cannabis imagery.
- Each newly visited pathname receives the next arrangement from a shuffled six-scene cycle. All six are used before the next cycle; a cycle does not immediately repeat the last displayed scene.
- Back/Forward, refresh, query filters, pagination, hash changes, and theme switches preserve a pathname's arrangement. A browser tab remembers the last 100 visited pathnames. If session storage is unavailable, navigation uses memory for the current page session; a full reload cannot retain unavailable storage.
- Backgrounds remain still while reading. Mobile hides side props and keeps a small footer arrangement clear of links. Long pages anchor the footer arrangement to the actual footer, rather than to the viewport.
- No AI call, database write, timer, or background service runs for decorative artwork. The browser reuses two optimized static WebP sheets, about 458 KB together. These sheets contain only artwork, never a mockup screenshot or sample inventory.

## Artwork and implementation

`public/images/market/layu-market-masthead.webp` contains paired light/dark masthead panels. `public/images/market/collector-props.webp` contains six object groups in a three-column grid, with light groups in the first two rows and dark groups in the last two rows. Both were generated from the approved references, then converted to WebP without resizing or cropping.

The image generator did not supply a usable alpha channel. The production assets therefore use neutral white/black grounds, with CSS multiply/screen blending into the shared page background. Each theme selects its corresponding artwork. Small differences in generated lighting and placement remain; these are production adaptations of the approved composition.

`MarketBackdrop` owns only decorative display and retains one browser-session controller. The shuffle and storage rules live separately in `src/lib/ui/market-backgrounds.ts`. Decorations ignore pointer events and are hidden from assistive technology. The masthead is an accessible home link. Navigation, theme controls, item images, catalog data, payments, and authentication remain live application elements.

The homepage uses the approved “Good finds. New possibilities.” heading and concise marketplace subtitle. Old framed artwork is removed from the catalog and account layouts. Existing social-preview metadata is preserved.

## Release coordination

These source changes are independent of the planned Lightsail migration. Release the validated application through the selected host's normal process, including the pending inventory and verification migrations when releasing this complete working tree. Do not copy local demo data or preview fixtures into production.

Photo descriptions use the separately configured Gemini or OpenAI [provider activation](ai-listing-descriptions.md#connect-the-provider-on-the-current-host). Gemini is selected for local setup; this does not activate the live site. The appearance can run with AI descriptions disabled.
