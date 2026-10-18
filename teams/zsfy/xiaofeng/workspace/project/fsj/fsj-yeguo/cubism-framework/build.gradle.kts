// Live2D Cubism Framework 安卓库模块。
// 源码与着色器资产直接引用官方 SDK 目录（CubismSdkForJava-5-r.5），不复制进仓库。
// Core 原生引擎（Live2DCubismCore.aar）由 app 模块以 implementation 引入提供运行时。
plugins {
    id("com.android.library")
}

android {
    namespace = "com.live2d.sdk.cubism.framework"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    sourceSets {
        getByName("main") {
            java.srcDirs(
                "../CubismSdkForJava-5-r.5/CubismSdkForJava-5-r.5/Framework/framework/src/main/java"
            )
            assets.srcDirs(
                "../CubismSdkForJava-5-r.5/CubismSdkForJava-5-r.5/Framework/framework/src/main/assets"
            )
        }
    }
}

dependencies {
    compileOnly(
        files(
            "../CubismSdkForJava-5-r.5/CubismSdkForJava-5-r.5/Core/android/Live2DCubismCore.aar"
        )
    )
}
