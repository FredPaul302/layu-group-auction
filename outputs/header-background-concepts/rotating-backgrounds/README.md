# Rotating background concepts
Status: Six new concept previews created from the approved B v2 appearance. The original B v2 remains the approved base; these variations are proposed extensions of the user's request for 6–9 arrangements. No application code, production assets, hosting, or deployment changed.

## Preview set
Each file shows the same arrangement in light and dark.
| Concept | Character | Preview |
| --- | --- | --- |
| 01 — Retro console | Gray console, rectangular controllers, cartridges | [Open](01-retro-console-light-dark.png) |
| 02 — Arcade finds | Joystick, tokens, ticket, collectible robot | [Open](02-arcade-light-dark.png) |
| 03 — Handheld collection | Handheld console, cartridges, travel case; especially restrained | [Open](03-handhelds-light-dark.png) |
| 04 — Game night | Dual-grip controller, disc and case, compact console | [Open](04-game-night-light-dark.png) |
| 05 — Collector's shelf | Computer joystick, small robot, game boxes and booklet | [Open](05-collectors-shelf-light-dark.png) |
| 06 — Green room | Gaming objects with one recognizable cannabis botanical print; optional accent | [Open](06-green-room-light-dark.png) |

Recommended initial pool: the original B v2 vintage arrangement plus gaming concepts 01–05 = six looks. Including the optional Green room variation gives seven. This keeps gaming prominent and cannabis secondary, following the user's self-correction.

## What remains consistent
Use the original approved LAYU MARKET masthead, shared warm-stone / blue-charcoal ground, clear content column, live footer branding and links, and removed small top wordmarks. Only the side and bottom objects change. The scenes deliberately vary object counts and spacing, while remaining arranged rather than placing objects at arbitrary random coordinates.

## Proposed navigation behavior
1. Shuffle the available arrangements for each browser-tab session. Assign the next unused look to each newly visited pathname. Use all available arrangements before repeating; avoid an immediate repeat when reshuffling.
2. Remember that pathname's assignment during the visit. Returning through links, Back/Forward or refresh restores it.
3. Filters, sort/search queries, pagination parameters, hash changes, form results, bidding updates, and theme switches do not consume a new arrangement. A different actual page or listing can get the next look.
4. Light and dark use the same objects in the same positions, with corresponding lighting.
5. No automatic timed rotation, parallax, or movement while reading. If a short transition is used, honor reduced-motion preferences.
6. Simplify mobile to the masthead and a small footer grouping; hide side objects before they interfere with reading or controls.
7. Keep payment, verification and admin forms quiet by suppressing nearby decorative props.

## Later implementation
Use one persistent client decoration component inside the existing server-rendered SiteShell, following the current html[data-theme] behavior. Use a versioned sessionStorage shuffle bag and pathname-to-look map, with an in-memory fallback. The same pathname must restore correctly on both client navigation and full reloads because catalog filters use ordinary GET forms. Avoid random server-rendered markup or content layout shifts.

Prepare separate optimized decorative layers on a shared base; do not use the full website screenshots as backgrounds and do not rerun AI generation for visitors. Retain real text, accessible controls, navigation, product photos and inventory data. Decorations should not capture pointer events or be announced by screen readers. Load selected assets rather than all of the large comparison images. The behavior needs no database writes or additional server service, and is independent of the Lightsail migration.

## Review limits
These are image-generated composition previews, not pixel-exact production templates. Preserve the original B v2 masthead and actual live footer consistently during implementation. In particular, 01/02 omit the footer brand in their generated previews; do not carry that omission into the site. Concept 05 has a small light/dark joystick placement difference; production layers should lock positions. The corrected final 04 keeps the lower objects clear of footer links. The 06 cannabis print is identifiable and should be treated as an optional botanical design.

Sample products, prices and copy are illustrative. Mobile and long catalog pages still need implementation validation. Both the original approved design and all generated concept files are preserved.

Generation: built-in image-generation tool. Full prompts are saved in prompts.txt. The individual preview paths above are the final saved concept artifacts.
