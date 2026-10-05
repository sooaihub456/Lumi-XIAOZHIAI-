import { build, Platform, Arch } from 'electron-builder';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { prepareDesktop, projectRoot } from './prepare-desktop.mjs';

try {
  const { directory, version } = await prepareDesktop();
  const electron = JSON.parse(await readFile(resolve(projectRoot, 'node_modules/electron/package.json'), 'utf8'));
  const archName = process.env.MORI_DESKTOP_ARCH || process.arch;
  if (!['x64', 'arm64'].includes(archName)) throw new Error('Desktop builds support x64 or arm64.');
  const arch = archName === 'arm64' ? Arch.arm64 : Arch.x64;
  const output = resolve(projectRoot, 'artifacts/desktop');
  await mkdir(output, { recursive: true });
  const targetNames = process.platform === 'win32' ? ['nsis', 'zip'] : process.platform === 'darwin' ? ['dmg', 'zip'] : ['AppImage', 'tar.gz'];
  const signed = process.env.MORI_SIGN_RELEASE === '1';
  const artifacts = await build({
    projectDir: directory,
    targets: Platform.current().createTarget(targetNames, arch),
    publish: 'never',
    config: {
      appId: 'app.mori.companion.desktop', productName: 'Mori', electronVersion: electron.version,
      asar: true, npmRebuild: false, nodeGypRebuild: false, forceCodeSigning: signed,
      directories: { app: directory, output, buildResources: resolve(directory, 'resources') },
      files: ['desktop/**', 'dist/**', 'resources/**', 'licenses/**', 'package.json'],
      artifactName: 'Mori-${version}-${os}-${arch}.${ext}',
      protocols: [{ name: 'Open website in Mori', schemes: ['mori-browser'] }],
      icon: resolve(directory, 'resources/icon.png'),
      electronFuses: { runAsNode: false, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false, grantFileProtocolExtraPrivileges: false, resetAdHocDarwinSignature: process.platform === 'darwin' && !signed },
      win: { ...(signed ? {} : { signAndEditExecutable: false }) },
      nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true, deleteAppDataOnUninstall: false },
      mac: { category: 'public.app-category.productivity', ...(signed ? {} : { identity: null, hardenedRuntime: false }) },
      linux: { category: 'Network', synopsis: 'A companion and a browser, in one little world', executableName: 'mori' },
    },
  });
  const sums = [];
  for (const artifact of artifacts) {
    const bytes = await readFile(artifact);
    sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${basename(artifact)}`);
  }
  await writeFile(resolve(output, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
  await writeFile(resolve(output, 'build-info.json'), `${JSON.stringify({ app: 'Mori', version, platform: process.platform, arch: archName, electron: electron.version, signed, builtAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'local' }, null, 2)}\n`);
  await copyFile(resolve(projectRoot, 'desktop/INSTALL.txt'), resolve(output, 'INSTALL.txt'));
  console.log(`Desktop packages: ${output}\n${signed ? 'Signing was requested.' : 'These preview builds are unsigned; they are not production releases.'}`);
} catch (error) { console.error(`Desktop packaging failed: ${error.message}`); process.exitCode = 1; }