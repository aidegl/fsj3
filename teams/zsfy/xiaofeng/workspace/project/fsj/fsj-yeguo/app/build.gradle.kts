plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.fsj.yeguo"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.fsj.yeguo"
        minSdk = 26          // Android 8.0+（TYPE_APPLICATION_OVERLAY 悬浮窗）
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    // 网络层：LLM 直连 + HAP 走 Node 代理，都走 OkHttp
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // 语音播报用手机自带 TTS 引擎，无额外依赖
    // Live2D：Cubism Framework（库模块）+ Core 原生引擎（AAR）
    implementation(project(":cubism-framework"))
    implementation(files("libs/Live2DCubismCore.aar"))
}
