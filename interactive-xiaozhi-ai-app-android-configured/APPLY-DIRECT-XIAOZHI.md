# Apply this upgrade to the existing GitHub repository

Your repository currently keeps the app under `interactive-xiaozhi-ai-app-android-configured/` and the Android APK workflow at the repository root.

Replace/upload the modified project files into that existing app folder, keeping their relative paths. The root `.github/workflows/android-apk.yml` does not need a special bridge change; it can keep running `node scripts/build-apk.mjs` inside the app folder.

Important changed files include:

- `native/android/app/src/main/java/app/mori/companion/MoriXiaozhiPlugin.java` (new)
- `native/android/app/src/main/java/app/mori/companion/MainActivity.java`
- `src/lib/xiaozhiNative.ts` (new)
- `src/hooks/useXiaozhi.ts`
- `src/components/Panels.tsx`
- `src/App.tsx`
- `src/types.ts`
- `scripts/prepare-android.mjs`
- `scripts/build-apk.mjs`

Commit the changes to `main`. Your existing **Build Android APK** workflow should start again. Install the newly generated `mori-preview.apk`; the already-installed older APK cannot gain the native direct-connection plugin without rebuilding.
