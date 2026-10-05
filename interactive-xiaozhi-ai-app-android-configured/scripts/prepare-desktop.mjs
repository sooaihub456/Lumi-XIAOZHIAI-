import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as bundle } from 'esbuild';
import { Resvg } from '@resvg/resvg-js';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const desktopDirectory = resolve(projectRoot, '.desktop-app');

export function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 12) throw new Error('Mori Desktop tooling requires Node 22.12 or newer. Node 24 LTS is recommended.');
}

export async function prepareDesktop() {
  checkNode();
  if (!existsSync(resolve(projectRoot, 'dist/index.html'))) throw new Error('Build the web app with npm run build before preparing the desktop app.');
  const buildNumber = process.env.MORI_DESKTOP_BUILD || process.env.GITHUB_RUN_NUMBER || '1';
  if (!/^\d{1,5}$/.test(buildNumber) || Number(buildNumber) < 1 || Number(buildNumber) > 65535) throw new Error('MORI_DESKTOP_BUILD must be between 1 and 65535.');
  await rm(desktopDirectory, { force: true, recursive: true });
  await mkdir(resolve(desktopDirectory, 'desktop'), { recursive: true });
  await mkdir(resolve(desktopDirectory, 'resources'), { recursive: true });
  await mkdir(resolve(desktopDirectory, 'licenses'), { recursive: true });
  await cp(resolve(projectRoot, 'dist'), resolve(desktopDirectory, 'dist'), { recursive: true });

  // Generate isolated application metadata. The React project's package.json is not changed.
  const metadata = {
    name: 'mori-desktop', productName: 'Mori', version: `0.5.${Number(buildNumber)}-preview`,
    description: 'Your little companion with a local, isolated Chromium browser.',
    author: 'Mori', license: 'UNLICENSED', private: true, main: 'desktop/main.cjs',
  };
  await writeFile(resolve(desktopDirectory, 'package.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  await bundle({
    entryPoints: { main: resolve(projectRoot, 'desktop/main.cjs'), preload: resolve(projectRoot, 'desktop/preload.cjs') },
    outdir: resolve(desktopDirectory, 'desktop'), outExtension: { '.js': '.cjs' }, bundle: true,
    platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], legalComments: 'eof', sourcemap: false,
  });

  const logo = await readFile(resolve(projectRoot, 'public/favicon.svg'), 'utf8');
  await writeFile(resolve(desktopDirectory, 'resources/icon.png'), new Resvg(logo, { fitTo: { mode: 'width', value: 512 } }).render().asPng());
  for (const [source, target] of [
    ['node_modules/ipaddr.js/LICENSE', 'ipaddr.txt'],
    ['node_modules/@fontsource-variable/dm-sans/LICENSE', 'DM-Sans-OFL.txt'],
    ['node_modules/@fontsource-variable/manrope/LICENSE', 'Manrope-OFL.txt'],
    ['node_modules/electron/LICENSE', 'Electron-MIT.txt'],
  ]) await cp(resolve(projectRoot, source), resolve(desktopDirectory, 'licenses', target));
  console.log(`Mori Desktop prepared in ${desktopDirectory}. No server URL or private credentials are included.`);
  return { directory: desktopDirectory, version: metadata.version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  prepareDesktop().catch((error) => { console.error(error.message); process.exitCode = 1; });
}