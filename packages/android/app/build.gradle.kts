plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release builds are signed with the key in MARKTEXT_KEYSTORE_* when set (CI
// secrets); otherwise with the committed dev key so every build of this repo
// can be installed over the previous one without uninstalling.
val releaseKeystore = System.getenv("MARKTEXT_KEYSTORE_FILE")?.let(::File)?.takeIf { it.exists() }

android {
    namespace = "me.marktext.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "me.marktext.android"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("MARKTEXT_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("MARKTEXT_VERSION_NAME") ?: "0.1.0-dev"
    }

    signingConfigs {
        getByName("debug") {
            storeFile = file("marktext-dev.keystore")
            storePassword = "marktext"
            keyAlias = "marktext-dev"
            keyPassword = "marktext"
        }
        create("release") {
            if (releaseKeystore != null) {
                storeFile = releaseKeystore
                storePassword = System.getenv("MARKTEXT_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MARKTEXT_KEY_ALIAS")
                keyPassword = System.getenv("MARKTEXT_KEY_PASSWORD")
            } else {
                storeFile = file("marktext-dev.keystore")
                storePassword = "marktext"
                keyAlias = "marktext-dev"
                keyPassword = "marktext"
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.webkit:webkit:1.14.0")
}

// The editor UI is built by Vite (`pnpm --filter marktext-android build:web`);
// fail early with a clear message instead of shipping an APK with no UI.
val checkWebAssets by tasks.registering {
    val index = file("src/main/assets/www/index.html")
    doLast {
        check(index.exists()) {
            "Missing ${index.path}. Run `pnpm --filter marktext-android build:web` from the repo root first."
        }
    }
}
tasks.named("preBuild") { dependsOn(checkWebAssets) }
