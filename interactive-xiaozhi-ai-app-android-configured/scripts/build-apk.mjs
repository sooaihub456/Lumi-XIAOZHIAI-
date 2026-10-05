import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { prepareAndroid, root, run } from './prepare-android.mjs';

async function buildApk() {
  const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  const check = spawnSync(java, ['-version'], { encoding: 'utf8' });
  const version = `${check.stdout ?? ''}${check.stderr ?? ''}`;
  const major = Number(version.match(/version\s+"(\d+)/)?.[1]);
  if (check.error || check.status !== 0 || major !== 21) throw new Error('Mori Android needs JDK 21. Set JAVA_HOME to your JDK 21 installation, or use the GitHub Actions build.');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk || !existsSync(resolve(sdk, 'platforms/android-36/android.jar'))) throw new Error('Set ANDROID_HOME to an Android SDK installation with Android 36 and build-tools 36.0.0.');

  await prepareAndroid();
  const android = resolve(root, 'android');
  if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', 'gradlew.bat :app:assembleDebug --no-daemon --stacktrace'], android);
  else run('sh', ['gradlew', ':app:assembleDebug', '--no-daemon', '--stacktrace'], android);

  const builtApk = resolve(android, 'app/build/outputs/apk/debug/app-debug.apk');
  if (!existsSync(builtApk)) throw new Error('Gradle completed but the expected APK was not found.');
  const tools = (await readdir(resolve(sdk, 'build-tools'))).filter((entry) => /^\d+\.\d+\.\d+$/.test(entry)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const signer = tools.map((entry) => resolve(sdk, 'build-tools', entry, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner')).find(existsSync);
  if (!signer) throw new Error('Android apksigner is missing. Install Android SDK build-tools before distributing the APK.');
  if (process.platform === 'win32') run('cmd.exe', ['/d', '/s', '/c', `""${signer}" verify --verbose --print-certs "${builtApk}""`]);
  else run(signer, ['verify', '--verbose', '--print-certs', builtApk]);

  const artifacts = resolve(root, 'artifacts');
  await mkdir(artifacts, { recursive: true });
  const apk = resolve(artifacts, 'mori-preview.apk');
  await copyFile(builtApk, apk);
  const checksum = createHash('sha256').update(await readFile(apk)).digest('hex');
  await writeFile(resolve(artifacts, 'mori-preview.apk.sha256'), `${checksum}  mori-preview.apk\n`);
  await writeFile(resolve(artifacts, 'build-info.json'), `${JSON.stringify({ app: 'Mori', package: 'app.mori.companion', variant: 'debug', minAndroid: '7.0', minWebView: 120, commit: process.env.GITHUB_SHA || 'local', builtAt: new Date().toISOString(), sha256: checksum }, null, 2)}\n`);
  await copyFile(resolve(root, 'native/INSTALL.txt'), resolve(artifacts, 'INSTALL.txt'));
  console.log(`\nInstallable test APK: ${apk}\nSHA-256: ${checksum}\nThis is a debug-signed preview, not a Play Store release.`);
}

buildApk().catch((error) => { console.error(`\nAndroid build failed: ${error.message}`); process.exitCode = 1; });