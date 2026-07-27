pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "SmartDoor"

// Phase A1.1: single module.
// Future phases (:core, :data, :feature-owner, :feature-guard, :feature-visitor, etc.)
// will be added here as one-line includes — no other file needs to change.
include(":app")
