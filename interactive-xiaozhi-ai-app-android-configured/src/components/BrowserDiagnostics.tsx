import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Download, ExternalLink, LoaderCircle, Monitor, ShieldCheck, WifiOff } from 'lucide-react';
import { checkBrowserWebsite, safeWebUrl, type BrowserDiagnostic, type BrowserSettings } from '../lib/browser';
import { copyText, exportFile, isShareCancellation } from '../lib/files';

interface Props { mode: 'electron' | 'android' | 'chromium' | 'external'; settings: BrowserSettings; initialUrl: string }

export default function BrowserDiagnostics({ mode, settings, initialUrl }: Props) {
  const [url, setUrl] = useState(initialUrl || 'https://example.com/');
  const [result, setResult] = useState<BrowserDiagnostic | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function check() {
    setError(''); setResult(null); setRunning(true);
    try {
      const response = await checkBrowserWebsite(url, settings);
      if (alive.current) setResult(response);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'The website check failed. Update the installed app and try again.'); }
    finally { if (alive.current) setRunning(false); }
  }

  async function saveReport() {
    const report = { runtime: mode, page: location.origin, checkedAt: new Date().toISOString(), result, error: error || undefined, note: 'This report contains no Xiaozhi credentials or browser connection token. A successful main-page check is not a guarantee of sign-in or media compatibility.' };
    try { await exportFile('mori-browser-check.json', new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); }
    catch (cause) { if (!isShareCancellation(cause)) setError('The diagnostic report could not be saved.'); }
  }

  let desktopLink = 'mori-browser://open';
  try { desktopLink += `?url=${encodeURIComponent(safeWebUrl(url))}`; } catch { /* A launch without a URL opens the desktop browser home. */ }

  return <section className="browser-doctor" aria-labelledby="browser-doctor-title">
    <div className="browser-doctor-heading"><ShieldCheck size={19} /><div><h3 id="browser-doctor-title">Check the browser, not just the build.</h3><p>A real page load through the selected browser engine.</p></div></div>
    <label className="field-label" htmlFor="browser-check-url">Website to check</label>
    <div className="browser-check-input"><input id="browser-check-url" value={url} onChange={(event) => setUrl(event.target.value)} disabled={running} aria-label="Website to check" placeholder="https://example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} /><button onClick={() => void check()} disabled={running}>{running ? <LoaderCircle size={15} className="spin" /> : <ArrowRight size={15} />}{running ? 'Checking...' : 'Check live website'}</button></div>
    <p className="field-hint">This loads a live page in a temporary view. It does not send page text to Xiaozhi or replace failures with saved content.</p>
    {error && <div className="browser-check-error" role="alert"><WifiOff size={16} /><p>{error}</p></div>}
    {result && <div className={`browser-check-result ${result.status}`} role="status"><div>{result.status === 'passed' ? <Check size={18} /> : <WifiOff size={18} />}<strong>{result.status === 'passed' ? 'A real webpage loaded.' : 'The website check failed.'}</strong></div><dl><dt>Engine</dt><dd>{result.engine}</dd><dt>Address</dt><dd>{result.finalUrl || result.target}</dd><dt>Page title</dt><dd>{result.title || 'Not returned'}</dd><dt>Response</dt><dd>{result.httpStatus ? `HTTP ${result.httpStatus}` : result.code || (result.status === 'passed' ? 'Main page finished loading' : 'No response')}{result.code && result.httpStatus ? ` / ${result.code}` : ''}</dd><dt>Checked</dt><dd>{new Date(result.checkedAt).toLocaleTimeString()} ({(result.durationMs / 1000).toFixed(1)}s)</dd></dl><p>{result.message}</p></div>}
    {(result || error) && <button className="text-button" onClick={() => void saveReport()}><Download size={13} />Save diagnostic report</button>}
    {mode === 'external' && <div className="browser-start-help"><Monitor size={19} /><div><strong>To browse inside Mori, launch the installed app.</strong><p>If the updated Mori Desktop app is already installed, your operating system can open it here:</p><a className="secondary-button" href={desktopLink}>Open installed Mori Desktop<ExternalLink size={13} /></a><p>This does not install or download the desktop app. If it is not installed, use Node 24 with this project's dependencies, build the web app, then run:</p><div className="browser-launch-command"><code>node scripts/run-desktop.mjs</code><button aria-label="Copy desktop launch command" onClick={() => { void copyText('node scripts/run-desktop.mjs').then(() => setCopied(true)).catch(() => setError('Clipboard access is not available. Select and copy the command.')); }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div><p>The website preview does not contain Electron. Instructions are in DESKTOP.md; Android requires the rebuilt APK.</p></div></div>}
    <details className="browser-research-links"><summary>Why browser shells need a real engine</summary><p>Min uses native Chromium views. Electron explicitly distinguishes these from ordinary webpage frames. Qt WebEngine also embeds Chromium rather than removing a website's frame restrictions.</p><a href="https://github.com/minbrowser/min/blob/master/main/viewManager.js" target="_blank" rel="noopener noreferrer">Min browser source<ExternalLink size={11} /></a><a href="https://www.electronjs.org/docs/latest/tutorial/web-embeds" target="_blank" rel="noopener noreferrer">Electron web embedding guide<ExternalLink size={11} /></a><a href="https://doc.qt.io/qt-6/qtwebengine-features.html" target="_blank" rel="noopener noreferrer">Qt WebEngine capabilities<ExternalLink size={11} /></a></details>
  </section>;
}