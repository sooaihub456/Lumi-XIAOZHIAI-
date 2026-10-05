import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { prepareDesktop } from './prepare-desktop.mjs';

try {
  const { directory } = await prepareDesktop();
  const require = createRequire(import.meta.url);
  const executable = require('electron');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [directory], { stdio: 'inherit', env });
  child.on('error', (error) => { console.error(`Electron could not start: ${error.message}`); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
} catch (error) { console.error(error.message); process.exitCode = 1; }