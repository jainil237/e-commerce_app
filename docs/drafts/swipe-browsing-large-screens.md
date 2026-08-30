# Draft — swipe browsing on large screens

**Status:** Draft. Not scheduled, not designed, not agreed. This records the
thinking so the mobile feature does not silently become the only version.

## What exists today

Swipe browsing ships for **small screens only** (`max-width: 768px`, matching
`$bp-md`). On the products listing an iOS-style switch turns the grid into a
single-card deck:

| Gesture | Action |
|---|---|
| Swipe left | Next product |
| Swipe right | Previous product |
| Swipe up | Add to wishlist |
| Swipe down | Add to cart |

The preference is remembered per device in `localStorage` under `ms:swipe-mode`.
The toggle is not rendered at all above the breakpoint, so a desktop with a
touchscreen never sees it.

## Why it was capped at small screens

The gesture set is built for a thumb on a phone held one-handed. Three things do
not carry over:

1. **A mouse has no swipe.** The equivalent is click-drag, which on a desktop
   already means text selection or drag-and-drop. Overloading it invites
   accidental actions on a pointer far more precise than a thumb.
2. **Trackpad two-finger gestures are already spoken for** — horizontal scroll,
   browser back/forward. A page that intercepts them fights the OS and the
   browser, and loses on at least one platform.
3. **One card is a poor use of a wide viewport.** The grid shows a dozen
   products at a glance; a deck shows one. On a phone that trade buys
   one-handed speed. On a laptop it just removes information.

## Options for large screens, roughly in order of preference

### 1. Keyboard-driven deck (recommended starting point)
Keep the single-card layout, drive it with arrow keys: left/right browse, up
wishlists, down adds to cart. This is the closest honest translation — the
directional model survives, the input changes to one desktop actually has. It is
also the accessible version of the mobile feature, and would improve the phone
experience for anyone using an external keyboard.

**Open question:** arrow keys usually scroll. The deck would need focus before
capturing them, and a visible indication that it has focus.

### 2. Hover-reveal quick actions on the existing grid
Leave the grid alone; on hover, surface "add to cart" and "wishlist" affordances
on the card. Not a swipe feature at all, but it delivers the underlying value —
acting on a product without opening it — in a way that suits a pointer.

**Trade-off:** hover does not exist on touch or for keyboard users, so it needs
a focus-visible equivalent to be more than decoration.

### 3. Drag-to-zone
Drag a card onto a cart or wishlist drop target. Visually direct, and uses a
gesture desktops genuinely have.

**Trade-off:** the most work of the three, needs real drop-target design, and
drag has accessibility obligations that hover and keyboard do not.

## What to decide before building any of it

- Is the goal *parity with mobile*, or *the same value expressed natively*? These
  point at different options — 1 for the first, 2 for the second.
- Does the deck belong on the products listing only, or also on search results
  and category pages?
- Should tablets follow the phone or the desktop? An iPad has touch and a large
  viewport, so it satisfies neither rationale cleanly. Worth treating as its own
  case rather than assuming the breakpoint answers it.
- What happens to pagination in deck mode? Today the deck holds one page of
  results; swiping past the end stops rather than loading more.

## Known gaps in the shipped mobile version

Carried here so they are not lost:

- The deck operates on the current page of results only. Reaching the end stops;
  it does not fetch the next page.
- Cart and wishlist swipes deliberately leave the card in place rather than
  advancing, so the customer sees what they acted on. Whether that is right is a
  product call worth revisiting with real usage.
- There is no undo. A mis-swipe into the cart has to be corrected in the cart.
