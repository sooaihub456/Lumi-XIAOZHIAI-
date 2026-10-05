# Android Concentus build hotfix

This patch fixes the Android build error:

`package org.concentus does not exist`

Cause: the native Maven dependencies were being inserted into `android/app/build.gradle` before `npx cap sync android`. Capacitor can refresh the generated Gradle project during sync, so the dependency declaration was not guaranteed to remain on `debugCompileClasspath` when javac compiled `NativeOpusPlayer.java`.

Fix: synchronize Capacitor first, then inject and verify these dependencies in the final generated app Gradle file:

- `com.squareup.okhttp3:okhttp:4.12.0`
- `io.github.jaredmdobson:concentus:1.0.1`

Replace `scripts/prepare-android.mjs` in the project with the patched file, commit to `main`, and rebuild with the existing GitHub Actions workflow.
