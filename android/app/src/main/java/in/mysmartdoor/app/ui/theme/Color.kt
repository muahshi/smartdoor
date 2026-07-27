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

// ────────── Status colors — css/styles.css `:root` (--success/--warning/--danger/--info) ──────────
// Pulled verbatim from the production web app so a "delivered" badge, an
// error banner, etc. read as the same color on the website and in the app.
// "-Dim" variants are the same hex at the site's own alpha (used for chip/
// badge backgrounds); "-On" variants are the foreground color placed on top
// of the solid (non-dim) swatch.
val SmartDoorSuccess = Color(0xFF22C55E) // css --success
val SmartDoorSuccessDim = Color(0x2622C55E) // css --success-dim (alpha 0.15)
val SmartDoorOnSuccess = Color(0xFF06210F)
val SmartDoorWarning = Color(0xFFF59E0B) // css --warning
val SmartDoorWarningDim = Color(0x26F59E0B) // css --warning-dim (alpha 0.15)
val SmartDoorOnWarning = Color(0xFF241800)
val SmartDoorDanger = Color(0xFFEF4444) // css --danger
val SmartDoorDangerDim = Color(0x26EF4444) // css --danger-dim (alpha 0.15)
val SmartDoorOnDanger = Color(0xFFFFFFFF)
val SmartDoorInfo = Color(0xFF00A2E8) // css --info
val SmartDoorInfoDim = Color(0x2600A2E8) // css --info-dim (alpha 0.15)
val SmartDoorOnInfo = Color(0xFF001A26)

// ────────── Glass overlay tokens ──────────
// Used by GlassCard for the glassmorphism surface: a translucent tint of
// the dark navy surface plus a hairline gold-tinted border, layered over
// whatever sits behind it (screen background / imagery) with blur.
val SmartDoorGlassSurface = Color(0x99101B2E) // navy-card at ~60% alpha
val SmartDoorGlassBorder = Color(0x33C8963C) // gold at ~20% alpha
val SmartDoorGlassHighlight = Color(0x14FFFFFF) // faint top highlight, ~8% white
