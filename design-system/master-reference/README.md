# Master Reference — Design Authority

These three files are the **only visual source of truth** for SmartDoor's
approved products. Nothing in the renderer, the token files, or the
template-data JSON should ever contradict what these images show.

- `acrylic.webp`   → symlink to `../../images/acrylic-front.webp`
- `teakwood.webp`  → symlink to `../../images/teakwood-front.webp`
- `stainless.webp` → symlink to `../../images/stainless-front.webp`

They are **symlinks, not copies**, on purpose — the production asset in
`/images` stays the single physical file. This folder exists so the
design system has one canonical place to point to ("check the master
reference") without duplicating binaries that would drift out of sync
with the real production image if one copy got updated and the other
didn't.

## Rules for anyone touching the renderer or tokens

1. Do not redesign these products. Do not add new artwork.
2. Any renderer/token change that affects layout, spacing, typography,
   color, or proportions must be checked against these images first.
3. If a future change requires the master image itself to change,
   that's a design decision, not an engineering one — update the real
   file in `/images/*-front.webp` (the symlink will pick it up
   automatically) and call it out explicitly, don't fold it into an
   unrelated code change.
