import ipaddr from 'ipaddr.js';

export type SearchProvider = 'google' | 'youtube' | 'wikipedia';
export const websiteAliases: Record<string, string> = {
  google: 'https://www.google.com/',
  youtube: 'https://www.youtube.com/',
  yt: 'https://www.youtube.com/',
  wikipedia: 'https://en.wikipedia.org/',
  nasa: 'https://www.nasa.gov/',
};

function aliasFor(value: string) {
  const key = value.toLowerCase();
  return Object.prototype.hasOwnProperty.call(websiteAliases, key) ? websiteAliases[key] : undefined;
}

export function safeWebUrl(input: string) {
  const value = input.trim();
  if (!value || value.length > 8192) throw new Error('Enter a website address.');
  // A host with a port is not a URI scheme (example.com:8443 used to fail here).
  const hostWithPort = /^(?:\[[0-9a-f:]+\]|[^\s/?#:]+):\d+(?:[/?#]|$)/i.test(value);
  const explicitScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) && !hostWithPort;
  const normalized = value.startsWith('//') ? `https:${value}` : explicitScheme ? value : `https://${value}`;
  const url = new URL(aliasFor(value) || normalized);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS website without embedded credentials. Local files and executable URLs are not websites.');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(hostname)) {
    if (ipaddr.process(hostname).range() !== 'unicast') throw new Error('Local and private network addresses are not supported.');
  } else if (!hostname.includes('.') || /(^localhost$|\.localhost$|\.local$|\.internal$|\.home\.arpa$)/i.test(hostname)) {
    throw new Error('Open a public website, not a local or internal address.');
  }
  return url.href;
}

export function looksLikeUrl(input: string) {
  const value = input.trim();
  if (aliasFor(value) || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return true;
  if (/\s/.test(value.split(/[/?#]/)[0])) return false;
  try { const url = new URL(`https://${value}`); return url.hostname.includes('.') || url.hostname.startsWith('[') || url.hostname === 'localhost'; } catch { return false; }
}

export function isHttpUrl(value: string) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

export function webSearchUrl(query: string, provider: SearchProvider = 'google') {
  const encoded = encodeURIComponent(query.trim().slice(0, 500));
  if (provider === 'youtube') return `https://www.youtube.com/results?search_query=${encoded}`;
  if (provider === 'wikipedia') return `https://en.wikipedia.org/w/index.php?search=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

export function resolveBrowserInput(input: string, provider: SearchProvider = 'google') {
  const value = input.trim();
  if (looksLikeUrl(value)) {
    const url = safeWebUrl(value);
    const host = new URL(url).hostname;
    const selected: SearchProvider = isYouTube(url) ? 'youtube' : host === 'google.com' || host.endsWith('.google.com') ? 'google' : host.endsWith('.wikipedia.org') || host === 'wikipedia.org' ? 'wikipedia' : provider;
    return { kind: 'page' as const, url, query: '', provider: selected };
  }
  let query = value;
  let selected = provider;
  const prefixed = value.match(/^(?:(?:search|find)(?:\s+on)?\s+)?(google|youtube|wikipedia)(?:\s+for)?\s+(.+)$/i);
  const suffixed = value.match(/^(?:search\s+(?:for\s+)?)?(.+?)\s+on\s+(google|youtube|wikipedia)$/i);
  if (prefixed) { selected = prefixed[1].toLowerCase() as SearchProvider; query = prefixed[2]; }
  else if (suffixed) { selected = suffixed[2].toLowerCase() as SearchProvider; query = suffixed[1]; }
  query = query.trim().slice(0, 500);
  if (!query) throw new Error('Enter a search query.');
  return { kind: selected === 'wikipedia' ? 'wikipedia' as const : 'page' as const, url: webSearchUrl(query, selected), query, provider: selected };
}

export function isGoogleSignIn(url: string) {
  try { const host = new URL(url).hostname; return host === 'accounts.google.com' || host.endsWith('.accounts.google.com'); } catch { return false; }
}

export function isYouTube(url: string) {
  try { const host = new URL(url).hostname; return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be'; } catch { return false; }
}