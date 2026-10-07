import type { Message } from '../types';

export type ConversationTopicKind = 'news' | 'trending' | 'tech';

export interface ConversationTopic {
  id: string;
  title: string;
  url: string;
  source: string;
  kind: ConversationTopicKind;
  publishedAt?: number;
  score: number;
  sensitive?: boolean;
  why: string;
}

export interface ConversationTopicFeed {
  updatedAt: number;
  interests: string[];
  topics: ConversationTopic[];
  sources: string[];
  errors: string[];
}

const CACHE_KEY = 'mori-conversation-topic-feed';
const CACHE_TTL = 20 * 60_000;
const REQUEST_TIMEOUT = 10_000;
const MAX_TOPICS = 16;

const INTEREST_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'artificial intelligence', patterns: [/\b(ai|llm|gpt|chatgpt|machine learning|xiaozhi|voice agent|ai agent)\b/i, /(人工智能|大模型|小智|智能助手)/] },
  { label: 'gaming', patterns: [/\b(game|gaming|godot|unity|unreal|steam|pixel game|simulation game)\b/i, /(游戏|像素游戏|模拟游戏)/] },
  { label: 'badminton', patterns: [/\b(badminton|bwf|shuttlecock)\b/i, /(羽毛球|球拍)/] },
  { label: 'anime', patterns: [/\b(anime|manga|demon slayer|kimetsu)\b/i, /(动漫|动画|漫画|鬼灭)/] },
  { label: 'technology', patterns: [/\b(technology|software|coding|programming|android|app development|computer)\b/i, /(科技|软件|编程|电脑|安卓)/] },
  { label: 'science', patterns: [/\b(science|space|physics|biology|chemistry|astronomy|nasa)\b/i, /(科学|太空|物理|生物|化学|天文)/] },
  { label: 'design', patterns: [/\b(design|ui|ux|figma|animation|blender|3d art|pixel art)\b/i, /(设计|动画|建模|美术)/] },
  { label: 'sports', patterns: [/\b(sports?|football|soccer|basketball|tennis|olympics?)\b/i, /(体育|足球|篮球|网球|奥运)/] },
  { label: 'business', patterns: [/\b(business|startup|market|economy|entrepreneur|company)\b/i, /(商业|创业|市场|经济|公司)/] },
  { label: 'entertainment', patterns: [/\b(movie|movies|music|streaming|celebrity|tv series|film)\b/i, /(电影|音乐|明星|电视剧|娱乐)/] },
  { label: 'travel', patterns: [/\b(travel|trip|holiday|hotel|flight|tourism)\b/i, /(旅行|旅游|酒店|航班|假期)/] },
];

const SENSITIVE_RE = /\b(kill(?:ed|ing)?|death|dead|war|attack|shoot(?:ing|er)?|murder|crash|disaster|earthquake|explosion|hostage|terror|rape|suicide)\b/i;
const NOISE_TITLES = /^(main page|special:|wikipedia:|portal:|template:|category:|search|undefined)$/i;

function normalizeTitle(value: string) {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function topicId(source: string, title: string) {
  let hash = 2166136261;
  const value = `${source}:${title}`.toLowerCase();
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.toLowerCase().replace(/\W+/g, '-')}-${(hash >>> 0).toString(36)}`;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const relayAbort = () => controller.abort();
  signal?.addEventListener('abort', relayAbort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as T;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', relayAbort);
  }
}

function interestMatches(title: string, interests: string[]) {
  const lower = title.toLowerCase();
  return interests.reduce((count, interest) => count + (lower.includes(interest.toLowerCase()) ? 1 : 0), 0);
}

function scoreTopic(topic: Omit<ConversationTopic, 'score'>, interests: string[], popularity = 0) {
  const sourceBase = topic.kind === 'news' ? 52 : topic.kind === 'trending' ? 46 : 44;
  const relevance = interestMatches(topic.title, interests) * 24;
  const ageHours = topic.publishedAt ? Math.max(0, (Date.now() - topic.publishedAt) / 3_600_000) : 12;
  const freshness = Math.max(0, 18 - Math.min(18, ageHours / 2));
  const sensitivityPenalty = topic.sensitive ? 24 : 0;
  return sourceBase + relevance + freshness + Math.min(18, popularity) - sensitivityPenalty;
}

function parseGdeltDate(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/);
  if (!match) return undefined;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
}

function gdeltQuery(interests: string[]) {
  const latin = interests
    .filter((term) => /^[\p{L}\p{N} .+#'-]+$/u.test(term) && /[A-Za-z]/.test(term))
    .map((term) => term.replace(/["()]/g, '').trim())
    .filter(Boolean)
    .slice(0, 4);
  if (latin.length) return `(${latin.map((term) => term.includes(' ') ? `"${term}"` : term).join(' OR ')})`;
  return '(technology OR science OR gaming OR entertainment OR culture OR space OR innovation)';
}

async function fetchGdelt(interests: string[], signal?: AbortSignal): Promise<ConversationTopic[]> {
  type GdeltResponse = { articles?: Array<{ title?: string; url?: string; domain?: string; seendate?: string; sourcecountry?: string }> };
  const params = new URLSearchParams({
    query: gdeltQuery(interests),
    mode: 'ArtList',
    maxrecords: '18',
    format: 'json',
    sort: 'HybridRel',
    timespan: '36h',
  });
  const data = await fetchJson<GdeltResponse>(`https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`, signal);
  return (data.articles || []).flatMap((article) => {
    const title = normalizeTitle(article.title || '');
    if (!title || !article.url) return [];
    const publishedAt = parseGdeltDate(article.seendate);
    const sensitive = SENSITIVE_RE.test(title);
    const source = article.domain || article.sourcecountry || 'GDELT news';
    const base = { id: topicId('gdelt', title), title, url: article.url, source, kind: 'news' as const, publishedAt, sensitive, why: 'Fresh global news that can become a timely conversation.' };
    return [{ ...base, score: scoreTopic(base, interests) }];
  });
}

function yesterdayUtc() {
  const date = new Date(Date.now() - 24 * 60 * 60_000);
  return { year: String(date.getUTCFullYear()), month: String(date.getUTCMonth() + 1).padStart(2, '0'), day: String(date.getUTCDate()).padStart(2, '0') };
}

async function fetchWikipedia(language: 'en' | 'zh', interests: string[], signal?: AbortSignal): Promise<ConversationTopic[]> {
  type WikimediaResponse = { items?: Array<{ articles?: Array<{ article?: string; views?: number; rank?: number }> }> };
  const { year, month, day } = yesterdayUtc();
  const project = `${language}.wikipedia.org`;
  const data = await fetchJson<WikimediaResponse>(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${project}/all-access/${year}/${month}/${day}`, signal);
  const articles = data.items?.[0]?.articles || [];
  return articles.slice(0, 80).flatMap((item) => {
    const title = normalizeTitle(item.article || '');
    if (!title || NOISE_TITLES.test(title) || title.includes(':') || title.length < 3) return [];
    const sensitive = SENSITIVE_RE.test(title);
    const popularity = Math.max(0, 16 - Math.log10(Math.max(1, item.rank || 80)) * 5) + Math.min(4, Math.log10(Math.max(1, item.views || 1)));
    const source = language === 'zh' ? 'Wikipedia 中文 trends' : 'Wikipedia trends';
    const base = {
      id: topicId(`wiki-${language}`, title),
      title,
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent((item.article || '').replace(/ /g, '_'))}`,
      source,
      kind: 'trending' as const,
      sensitive,
      why: language === 'zh' ? 'A topic drawing unusually high attention from Chinese-language readers.' : 'A topic drawing unusually high public attention right now.',
    };
    return [{ ...base, score: scoreTopic(base, interests, popularity) }];
  }).slice(0, 14);
}

async function fetchHackerNews(interests: string[], signal?: AbortSignal): Promise<ConversationTopic[]> {
  type HnItem = { id?: number; type?: string; title?: string; url?: string; score?: number; time?: number; descendants?: number };
  const ids = await fetchJson<number[]>('https://hacker-news.firebaseio.com/v0/beststories.json', signal);
  const selected = ids.slice(0, 18);
  const items = await Promise.allSettled(selected.map((id) => fetchJson<HnItem>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, signal)));
  return items.flatMap((result) => {
    if (result.status !== 'fulfilled') return [];
    const item = result.value;
    const title = normalizeTitle(item.title || '');
    if (item.type !== 'story' || !item.id || !title) return [];
    const sensitive = SENSITIVE_RE.test(title);
    const popularity = Math.min(18, Math.log10(Math.max(1, (item.score || 0) + (item.descendants || 0))) * 7);
    const publishedAt = item.time ? item.time * 1000 : undefined;
    const base = {
      id: topicId('hn', title),
      title,
      url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      source: 'Hacker News',
      kind: 'tech' as const,
      publishedAt,
      sensitive,
      why: 'A high-interest technology/community story that can spark a future-facing conversation.',
    };
    return [{ ...base, score: scoreTopic(base, interests, popularity) }];
  });
}

function diversify(topics: ConversationTopic[]) {
  const seen = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const result: ConversationTopic[] = [];
  for (const topic of topics.sort((left, right) => right.score - left.score)) {
    const normalized = topic.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!normalized || seen.has(normalized)) continue;
    const bucket = topic.kind;
    const count = sourceCounts.get(bucket) || 0;
    if (count >= 6) continue;
    seen.add(normalized);
    sourceCounts.set(bucket, count + 1);
    result.push(topic);
    if (result.length >= MAX_TOPICS) break;
  }
  return result;
}

export function deriveInterestKeywords(messages: Message[], extraHint = '') {
  const recent = messages.filter((message) => message.role === 'user').slice(-16).map((message) => message.text).join(' ');
  const combined = `${recent} ${extraHint}`;
  return INTEREST_PATTERNS
    .map(({ label, patterns }) => ({ label, matches: patterns.reduce((count, pattern) => count + (pattern.test(combined) ? 1 : 0), 0) }))
    .filter((item) => item.matches > 0)
    .sort((left, right) => right.matches - left.matches)
    .slice(0, 6)
    .map((item) => item.label);
}

export async function discoverConversationTopics(interests: string[], signal?: AbortSignal): Promise<ConversationTopicFeed> {
  const settled = await Promise.allSettled([
    fetchGdelt(interests, signal),
    fetchWikipedia('en', interests, signal),
    fetchWikipedia('zh', interests, signal),
    fetchHackerNews(interests, signal),
  ]);
  const sourceNames = ['GDELT', 'Wikipedia EN', 'Wikipedia ZH', 'Hacker News'];
  const topics: ConversationTopic[] = [];
  const sources: string[] = [];
  const errors: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      topics.push(...result.value);
      if (result.value.length) sources.push(sourceNames[index]);
    } else {
      errors.push(`${sourceNames[index]}: ${result.reason instanceof Error ? result.reason.message : 'unavailable'}`);
    }
  });
  const feed: ConversationTopicFeed = { updatedAt: Date.now(), interests, topics: diversify(topics), sources, errors };
  if (feed.topics.length) writeCachedTopicFeed(feed);
  return feed;
}

export function readCachedTopicFeed(): ConversationTopicFeed | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as ConversationTopicFeed | null;
    return parsed && Array.isArray(parsed.topics) && typeof parsed.updatedAt === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedTopicFeed(feed: ConversationTopicFeed) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(feed)); } catch { /* Local storage can be unavailable in private/restricted webviews. */ }
}


export function clearCachedTopicFeed() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* Local storage can be unavailable in private/restricted webviews. */ }
}

export function isTopicFeedFresh(feed: ConversationTopicFeed | null, maxAge = CACHE_TTL) {
  return !!feed && Date.now() - feed.updatedAt < maxAge && feed.topics.length > 0;
}

export function conversationFuel(feed: ConversationTopicFeed, options?: { limit?: number; interest?: string; preferLight?: boolean }) {
  const limit = Math.max(1, Math.min(8, options?.limit || 5));
  const hint = options?.interest?.trim().toLowerCase() || '';
  const ranked = feed.topics.map((topic) => ({
    ...topic,
    score: topic.score + (hint && topic.title.toLowerCase().includes(hint) ? 45 : 0) + (options?.preferLight && !topic.sensitive ? 8 : 0),
  })).sort((left, right) => right.score - left.score);
  return ranked.slice(0, limit).map((topic) => ({
    title: topic.title,
    url: topic.url,
    source: topic.source,
    kind: topic.kind,
    ...(topic.publishedAt ? { publishedAt: topic.publishedAt } : {}),
    sensitive: !!topic.sensitive,
    why: topic.why,
  }));
}
