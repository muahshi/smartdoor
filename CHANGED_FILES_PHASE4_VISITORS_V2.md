# Phase 4 — VISITORS V2 — Changed Files

CTO-approved scope: Visitors Timeline, no new dependencies, no backend changes.

## New files

- `android/app/src/main/java/in/mysmartdoor/app/core/network/dto/VisitorActivityDto.kt`
  Request/response DTOs for the existing `get_owner_activity_feed` RPC.

- `android/app/src/main/java/in/mysmartdoor/app/core/data/VisitorRepository.kt`
  Reads the visitor timeline via that RPC only. No new table/column/RPC.

- `android/app/src/main/java/in/mysmartdoor/app/ui/screens/visitors/VisitorFeedViewModel.kt`
  Search / filter chips (All, Accepted, Missed, Declined, Favorites) / pagination state.

- `android/app/src/main/java/in/mysmartdoor/app/ui/screens/visitors/VisitorFeedScreen.kt`
  Premium visitor timeline screen — built entirely on existing Phase 1/2
  design-system components (SDTopBar, SDSearchBar, SDChip, SDCard, SDAvatar,
  SDBadge, SDSkeletonLoaderGroup, EmptyStateScreen, ErrorScreen, SDSectionHeader).
  Per CTO direction: no image library added — `photo_url` is modeled end-to-end
  but every row renders an SDAvatar initials glyph, not a photo.

## Edited files (additive only)

- `android/app/src/main/java/in/mysmartdoor/app/navigation/SmartDoorNavHost.kt`
  Registered `Routes.VISITOR_FEED` → `VisitorFeedScreen`. No other route touched.

- `android/app/src/main/java/in/mysmartdoor/app/ui/screens/dashboard/DashboardScreen.kt`
  The "Visitor History" Quick Action now navigates to `Routes.VISITOR_FEED`
  instead of showing the "coming soon" snackbar. Every other Quick Action
  is unchanged. One doc-comment line updated to stay accurate.

## Not touched

- No SQL migration, RLS policy, or RPC changed.
- No authentication code changed.
- `RepositoryModule.kt` left untouched — `VisitorRepository` uses the same
  plain `@Singleton @Inject constructor` pattern as `DashboardRepository`,
  which needs no `@Binds` entry.
- No new Gradle dependency added (no Coil/Glide).
