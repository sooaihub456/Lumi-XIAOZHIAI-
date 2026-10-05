import { existsSync } from 'node:fs';
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true', CAPACITOR_TELEMETRY_DISABLED: '1' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status ?? 'unknown'}.`);
}

export async function prepareAndroid() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Android packaging requires Node.js 22 or newer. Use the included GitHub Actions workflow or upgrade Node.');
  if (!existsSync(resolve(root, 'dist/index.html'))) throw new Error('The web build is missing. Run npm run build before preparing Android.');
  const capacitor = resolve(root, 'node_modules/@capacitor/cli/bin/capacitor');
  if (!existsSync(capacitor)) throw new Error('Install the project dependencies first.');

  // Generate from the installed official template, including its matching Gradle wrapper.
  if (!existsSync(resolve(root, 'android/app/build.gradle'))) run(process.execPath, [capacitor, 'add', 'android']);
  // Capacitor's template also defines ic_launcher_background. Mori defines it in colors.xml, so remove the duplicate before merging native resources.
  await rm(resolve(root, 'android/app/src/main/res/values/ic_launcher_background.xml'), { force: true });
  await cp(resolve(root, 'native/android'), resolve(root, 'android'), { recursive: true });

  // Let Capacitor finish generating/synchronizing the Android project first.
  // Capacitor 8 may refresh app/build.gradle during sync, so native Maven
  // dependencies must be injected AFTER this step or they can disappear from
  // the Java compile classpath.
  run(process.execPath, [capacitor, 'sync', 'android']);

  const gradlePath = resolve(root, 'android/app/build.gradle');
  const buildNumber = Number(process.env.MORI_VERSION_CODE || process.env.GITHUB_RUN_NUMBER || '1');
  if (!Number.isInteger(buildNumber) || buildNumber < 1 || buildNumber > 2100000000) throw new Error('MORI_VERSION_CODE must be a positive Android version code.');

  const gradle = await readFile(gradlePath, 'utf8');
  let updated = gradle
    .replace(/versionCode\s+(?:=\s*)?\d+/, `versionCode ${buildNumber}`)
    .replace(/versionName\s+(?:=\s*)?["'][^"']+["']/, `versionName "0.8.${buildNumber}-preview"`);

  // Native Android connects directly to Xiaozhi and decodes its raw Opus
  // packets. Keep these dependencies on the final app compile classpath.
  const nativeDependencies = [
    ['com.squareup.okhttp3:okhttp', 'implementation "com.squareup.okhttp3:okhttp:4.12.0"'],
    ['io.github.jaredmdobson:concentus', 'implementation "io.github.jaredmdobson:concentus:1.0.1"'],
  ];
  for (const [marker, declaration] of nativeDependencies) {
    if (!updated.includes(marker)) {
      const next = updated.replace(/dependencies\s*\{/, `dependencies {\n    ${declaration}`);
      if (next === updated) throw new Error(`Could not add Android dependency ${marker}: dependencies block was not found.`);
      updated = next;
    }
  }

  await writeFile(gradlePath, updated);

  // Fail early with a clear message instead of reaching javac with a missing
  // org.concentus.OpusDecoder class.
  const verifiedGradle = await readFile(gradlePath, 'utf8');
  for (const [marker] of nativeDependencies) {
    if (!verifiedGradle.includes(marker)) throw new Error(`Android dependency was not preserved: ${marker}`);
  }
  console.log('Android native dependencies ready: OkHttp + Concentus Opus decoder.');

  const licenses = resolve(root, 'android/app/src/main/assets/licenses');
  await mkdir(licenses, { recursive: true });
  for (const [packageName, filename] of [
    ['@fontsource-variable/dm-sans', 'DM-Sans-OFL.txt'],
    ['@fontsource-variable/manrope', 'Manrope-OFL.txt'],
  ]) {
    await copyFile(resolve(root, 'node_modules', packageName, 'LICENSE'), resolve(licenses, filename));
  }
  console.log('Mori Android project prepared in android/. The built web app and native plugins are bundled locally.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  prepareAndroid().catch((error) => { console.error(error.message); process.exitCode = 1; });
}