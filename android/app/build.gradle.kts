import java.io.FileInputStream
import java.util.Properties

// ROOT CAUSE FIX (runtime "No internet connection" on login):
// SUPABASE_URL / SUPABASE_ANON_KEY were sourced ONLY from System.getenv(...),
// defaulting to "" when unset. Local/Android Studio builds don't inherit
// shell env vars by default, so every local build silently produced an
// empty Supabase URL. Fall back to local.properties (gitignored, standard
// Android pattern) when the env var isn't set. CI/Play builds are
// unaffected — env vars still take priority.
val localProperties = Properties().apply {
    val localPropsFile = rootProject.file("local.properties")
    if (localPropsFile.exists()) {
        load(FileInputStream(localPropsFile))
    }
}

fun supabaseConfigValue(envKey: String, localKey: String): String =
    System.getenv(envKey)?.takeIf { it.isNotBlank() }
        ?: localProperties.getProperty(localKey)?.takeIf { it.isNotBlank() }
        ?: ""

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.ksp)
    alias(libs.plugins.kotlin.serialization)
}

// Phase 12E.15 — MASKED CALL → NATIVE ANDROID FCM NOTIFICATION.
//
// The Google Services Gradle plugin FAILS THE BUILD outright if applied
// without an app/google-services.json present (it errors during
// evaluation, before any task runs) — so it is applied conditionally here
// rather than via the plugins{} block above (which cannot be conditional).
// This is the file this repo's owner must supply — see this project's
// FCM verification report for exactly what's blocked without it. Every
// other part of this phase (Firebase Messaging dependency, the
// FirebaseMessagingService subclass, manifest registration, token
// registration plumbing) compiles and links fine without this file; only
// runtime FCM delivery (and, per the plugin's own behavior, initializing
// FirebaseApp with real project identity) needs it.
val googleServicesJson = file("google-services.json")
if (googleServicesJson.exists()) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.warn(
        "[SmartDoor] android/app/google-services.json not found — skipping the " +
            "Google Services Gradle plugin. The app will build, but native FCM " +
            "push (masked-call notifications when the app is backgrounded/killed) " +
            "will not initialize at runtime until this file is added. " +
            "See FCM_INTEGRATION_VERIFICATION_REPORT.md."
    )
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
                "\"${supabaseConfigValue("SMARTDOOR_DEV_SUPABASE_URL", "smartdoor.dev.supabaseUrl")}\""
            )
            buildConfigField(
                "String", "SUPABASE_ANON_KEY",
                "\"${supabaseConfigValue("SMARTDOOR_DEV_SUPABASE_ANON_KEY", "smartdoor.dev.supabaseAnonKey")}\""
            )
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            buildConfigField("String", "ENVIRONMENT_NAME", "\"staging\"")
            buildConfigField(
                "String", "SUPABASE_URL",
                "\"${supabaseConfigValue("SMARTDOOR_STAGING_SUPABASE_URL", "smartdoor.staging.supabaseUrl")}\""
            )
            buildConfigField(
                "String", "SUPABASE_ANON_KEY",
                "\"${supabaseConfigValue("SMARTDOOR_STAGING_SUPABASE_ANON_KEY", "smartdoor.staging.supabaseAnonKey")}\""
            )
        }
        create("prod") {
            dimension = "env"
            // no suffix — this is the Play Store identity
            buildConfigField("String", "ENVIRONMENT_NAME", "\"prod\"")
            buildConfigField(
                "String", "SUPABASE_URL",
                "\"${supabaseConfigValue("SMARTDOOR_PROD_SUPABASE_URL", "smartdoor.prod.supabaseUrl")}\""
            )
            buildConfigField(
                "String", "SUPABASE_ANON_KEY",
                "\"${supabaseConfigValue("SMARTDOOR_PROD_SUPABASE_ANON_KEY", "smartdoor.prod.supabaseAnonKey")}\""
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

    // Phase A1.3 — App shell & navigation foundation.
    implementation(libs.androidx.navigation.compose)
    // Phase A1.5 — LoginScreen gets its first ViewModel.
    implementation(libs.androidx.hilt.navigation.compose)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    // Phase A1.2 — Core Infrastructure.
    // These are configured (client provider, DI modules) but not called from
    // any screen or business flow yet — that starts in A1.3.
    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.auth)
    implementation(libs.supabase.realtime)
    // Phase A1.5 — invokes the existing verify-pin Edge Function.
    implementation(libs.supabase.functions)
    implementation(libs.ktor.client.android)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)

    // Phase 12E.2 — PREMIUM APP IDENTITY: official Android 12+ SplashScreen
    // API (system splash) + QR bitmap encoder for the dynamic Smart Plate.
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.zxing.core)

    // Phase 12E.10 — NATIVE QR SCANNER. CameraX for the live preview +
    // frame analysis pipeline; frame decoding reuses zxing-core above
    // (MultiFormatReader) rather than adding ML Kit as a second barcode
    // library for the same job. No Coil/Glide — QrScannerScreen's overlay
    // is drawn with Compose Canvas, same convention as the rest of the app.
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)

    // Phase 12E.15 — MASKED CALL → NATIVE ANDROID FCM NOTIFICATION.
    // These resolve from Maven regardless of google-services.json — only
    // FirebaseApp's runtime initialization (via the conditionally-applied
    // plugin above) needs that file, not compilation.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.kotlinx.coroutines.play.services)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
