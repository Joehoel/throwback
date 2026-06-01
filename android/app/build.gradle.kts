import io.sentry.android.gradle.extensions.InstrumentationFeature

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.room)
    alias(libs.plugins.sentry.android.gradle)
}

android {
    namespace = "fyi.kuijper.throwback"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "fyi.kuijper.throwback"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Sideload signing: the debug keystore is enough to install on our own TV box (and upgrades
            // the existing install in place). Swap in a real upload key here for a Play Store release.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        // Needed so Sentry init can read BuildConfig (environment/release/DEBUG); off by default in AGP 8+.
        buildConfig = true
    }
}

room {
    // Geëxporteerde schema's per versie; de basis voor Auto Migrations en build-verificatie.
    schemaDirectory("$projectDir/schemas")
}

sentry {
    // Org/project + auth token are only used to upload source context + ProGuard mappings on release
    // builds. The token is a SECRET — read it from the SENTRY_AUTH_TOKEN env var or a `sentryAuthToken`
    // entry in ~/.gradle/gradle.properties (both outside this repo); never commit it. Debug builds and
    // people without the token build fine — the upload steps just no-op.
    org = System.getenv("SENTRY_ORG") ?: "de-nieuwe-psalmberijming"
    projectName = System.getenv("SENTRY_PROJECT") ?: "throwback"
    authToken = System.getenv("SENTRY_AUTH_TOKEN") ?: (findProperty("sentryAuthToken") as String?)

    // Readable stack frames in release builds (no-op while isMinifyEnabled = false, correct once on).
    // Upload to Sentry is on by default but can be skipped per-build with -PsentryUpload=false — handy
    // for a quick local sideload that shouldn't depend on the auth token / project slug being set up.
    val uploadToSentry = (findProperty("sentryUpload") as String?) != "false"
    includeSourceContext = uploadToSentry
    autoUploadProguardMapping = uploadToSentry

    // Bytecode auto-instrumentation: trace Room queries + capture android.util.Log as breadcrumbs.
    // OkHttp is wired by hand (the code uses bare OkHttpClient(), which the bytecode hook can miss).
    tracingInstrumentation {
        enabled = true
        features = setOf(InstrumentationFeature.DATABASE)
    }
    autoInstallation {
        // We add the SDK + integrations explicitly via the version catalog; don't let the plugin inject them.
        enabled = false
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.tv.material)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.zxing.core)
    implementation(libs.commons.text)
    implementation(libs.androidx.exifinterface)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(platform(libs.sentry.bom))
    implementation(libs.sentry.android)
    implementation(libs.sentry.okhttp)
    implementation(libs.sentry.kotlin.extensions)
    implementation("androidx.compose.animation:animation")
    testImplementation(libs.junit)
    testImplementation(libs.org.json)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}