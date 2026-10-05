export interface SearchHit { title: string; url: string; snippet: string; pageId: number }
export interface SearchResponse { query: string; results: SearchHit[]; retrievedAt: number; source: 'Wikipedia'; total: number }
export interface LiveArticle { title: string; text: string; url: string; retrievedAt: number; image?: string }

function textOnly(html: string) {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

async function wikipedia(params: Record<string, string>, signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 16000);
  const query = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', maxage: '0', smaxage: '0', ...params });
  try {
    // No app cache or example results: every request goes to the live public API.
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${query}`, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status}. Please try again.`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.info || 'The search service could not complete this request.');
    return data;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export async function liveSearch(query: string, signal?: AbortSignal): Promise<SearchResponse> {
  const clean = query.trim().slice(0, 500);
  if (!clean) throw new Error('What would you like to discover?');
  const data = await wikipedia({ list: 'search', srsearch: clean, srlimit: '8', srprop: 'snippet' }, signal);
  if (!Array.isArray(data.query?.search)) throw new Error('The search service returned an unexpected response.');
  return {
    query: clean,
    results: data.query.search.map((hit: { title: string; snippet: string; pageid: number }) => ({ title: hit.title, snippet: textOnly(hit.snippet), pageId: hit.pageid, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}` })),
    total: data.query.searchinfo?.totalhits ?? data.query.search.length,
    source: 'Wikipedia',
    retrievedAt: Date.now(),
  };
}

export async function fetchArticle(title: string, signal?: AbortSignal): Promise<LiveArticle> {
  const data = await wikipedia({ titles: title, prop: 'extracts|pageimages|info', explaintext: '1', exsectionformat: 'wiki', inprop: 'url', piprop: 'thumbnail', pithumbsize: '800', redirects: '1' }, signal);
  const page = data.query?.pages?.[0];
  if (!page || page.missing || !page.extract) throw new Error('This article could not be retrieved. Open its original page instead.');
  return { title: page.title, text: page.extract, url: page.fullurl, image: page.thumbnail?.source, retrievedAt: Date.now() };
}

export function browserIntent(text: string, name = 'Lumi'): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clean = text.replace(new RegExp(`^(?:hey[, ]+)?(?:${escaped}[, ]+)?(?:(?:can|could|would) you\\s+)?(?:please\\s+)?`, 'i'), '').trim();
  const match = clean.match(/^(?:search(?:\s+(?:online|the web|the internet))?(?:\s+for)?|look\s+up|google|youtube|browse(?:\s+to)?|open|find\s+(?:information|info)\s+(?:on|about))\s+(.+)$/i);
  if (!match) return null;
  const query = match[1].trim().replace(/^(?:the\s+)?website\s+/i, '').replace(/[.!?]$/, '');
  if (/^(?:my |your |the )?(?:computer|browser|pc)$/i.test(query)) return '';
  if (/^youtube\s/i.test(clean)) return `youtube ${query}`;
  return query;
}