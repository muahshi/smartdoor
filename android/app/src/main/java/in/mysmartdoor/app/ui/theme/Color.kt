package `in`.mysmartdoor.app.ui.theme

import androidx.compose.ui.graphics.Color

// Owner Dashboard V1 — real brand palette, no longer a placeholder. Values
// are taken verbatim from the production web design tokens in
// `css/landing-shared.css` (`:root { --navy: #060D1A; --gold: #C8963C;
// --accent: #00C8FF; }`), not invented here — same navy/gold/cyan the
// public site and product pages already render in. Light-theme colors are
// left as reasonable M3 defaults derived from the same hues; the app's
// primary brand surface is the dark scheme below (Premium Black + Gold).

val SmartDoorPrimary = Color(0xFF0B1525) // css --navy-card
val SmartDoorOnPrimary = Color(0xFFFFFFFF)
val SmartDoorSecondary = Color(0xFFC8963C) // css --gold
val SmartDoorOnSecondary = Color(0xFF1A1200)
val SmartDoorBackground = Color(0xFFFAF8F5)
val SmartDoorOnBackground = Color(0xFF0B1525)
val SmartDoorSurface = Color(0xFFFFFFFF)
val SmartDoorOnSurface = Color(0xFF0B1525)

// ────────── Dark (Premium Black + Gold) — css --navy / --gold / --accent ──────────
val SmartDoorPrimaryDark = Color(0xFF0B1525) // css --navy-card
val SmartDoorOnPrimaryDark = Color(0xFFE2ECF4)
val SmartDoorSecondaryDark = Color(0xFFC8963C) // css --gold
val SmartDoorOnSecondaryDark = Color(0xFF1A1200)
val SmartDoorTertiaryDark = Color(0xFF00C8FF) // css --accent
val SmartDoorOnTertiaryDark = Color(0xFF00232B)
val SmartDoorBackgroundDark = Color(0xFF060D1A) // css --navy
val SmartDoorOnBackgroundDark = Color(0xFFE2ECF4)
val SmartDoorSurfaceDark = Color(0xFF0B1525) // css --navy-card
val SmartDoorOnSurfaceDark = Color(0xFFE2ECF4)
val SmartDoorSurfaceVariantDark = Color(0xFF0F1B2E) // css --navy-card-2
val SmartDoorOnSurfaceVariantDark = Color(0xFFB8C4D4)
val SmartDoorOutlineDark = Color(0x1FFFFFFF) // css --border-subtle
