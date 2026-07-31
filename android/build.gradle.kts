/**
 * Root Gradle build file for the multi-module Android project.
 *
 * FIX (Phase 12E — Android Feature Completion Pass): this file was
 * previously a byte-for-byte duplicate of `app/build.gradle.kts` — the
 * `com.android.application` plugin (with the same `applicationId`/
 * `namespace = "in.mysmartdoor.app"` as the real `:app` module) was applied
 * directly to the ROOT project, which `settings.gradle.kts` never declares
 * as an Android module (it only does `include(":app")`). That made Gradle
 * try to configure two Android application modules sharing one
 * applicationId/namespace — the root project (compiling the stale,
 * out-of-date `android/src/main` source set left over from the original
 * "Phase A1.1: single module" layout, before `:app` was split out) and the
 * real `:app` module (`android/app/src/main`, the current 100+ file source
 * tree every screen in this app actually lives in).
 *
 * This is the standard top-level Gradle file for a multi-module project:
 * it only declares plugin versions for subprojects to `apply` (via
 * `alias(...)` with no version arg), and applies nothing to the root
 * project itself. `android/src/main` is now orphaned (no module compiles
 * it) — recommended for deletion in a follow-up cleanup phase; left in
 * place here since removing files wasn't the ask on this pass and no
 * production code was found to depend on it.
 */
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.hilt.android) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
