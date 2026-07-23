plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.ksp)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "in.mysmartdoor.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "in.mysmartdoor.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
    }

    // Build variants: env (dev/staging/prod) x buildType (debug/release).
    // Phase A1.2: Supabase URL/anon key are injected as BuildConfig fields,
    // sourced from environment variables at build time — same pattern the
    // web app uses (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Nothing is
    // hardcoded here; an empty value just means the field is unset locally.
    // Actual project URL/anon key values live in CI secrets / local.properties,
    // not in source control.
    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            buildConfigField("String", "ENVIRONMENT_NAME", "\"dev\"")
            buildConfigField(
                "String", "SUPABASE_URL",
                "\"${System.getenv("SMARTDOOR_DEV_SUPABASE_URL") ?: ""}\""
            )
            buildConfigField(
                "String", "SUPABASE_ANON_KEY",
                "\"${System.getenv("SMARTDOOR_DEV_SUPABASE_ANON_KEY") ?: ""}\""
            )
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            buildConfigField("String", "ENVIRONMENT_NAME", "\"staging\"")
            buildConfigField(
                "String", "SUPABASE_URL",
                "\"${System.getenv("SMARTDOOR_STAGING_SUPABASE_URL") ?: ""}\""
            )
            buildConfigField(
                "String", "SUPABASE_ANON_KEY",
                "\"${System.getenv("SMARTDOOR_STAGING_SUPABASE_ANON_KEY") ?: ""}\""
            )
        }
        create("prod") {
            dimension = "env"
            // no suffix — this is the Play Store identity
            buildConfigField("String", "ENVIRONMENT_NAME", "\"prod\"")
            buildConfigField(
                "String", "SUPABASE_URL",
                "\"${System.getenv("SMARTDOOR_PROD_SUPABASE_URL") ?: ""}\""
            )
            buildConfigField(
                "String", "SUPABASE_ANON_KEY",
                "\"${System.getenv("SMARTDOOR_PROD_SUPABASE_ANON_KEY") ?: ""}\""
            )
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // signingConfig intentionally omitted — release signing is set up
            // when the app is actually prepared for distribution, not in A1.1.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    // Phase A1.2 — Core Infrastructure.
    // These are configured (client provider, DI modules) but not called from
    // any screen or business flow yet — that starts in A1.3.
    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.auth)
    implementation(libs.supabase.realtime)
    implementation(libs.ktor.client.android)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
