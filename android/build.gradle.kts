// Top-level build file: declares plugin versions ONCE via the version catalog.
// Sub-modules apply these plugins without redeclaring versions, keeping
// every future module (Phase B/C onward) on identical, consistent versions.

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.hilt.android) apply false
    alias(libs.plugins.ksp) apply false
}
