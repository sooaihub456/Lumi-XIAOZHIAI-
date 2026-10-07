import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Bookmark, Check, ChevronDown, Copy, ExternalLink, Eye, EyeOff, Heart, Leaf, LoaderCircle, Mic, Moon, Palette, PlugZap, Search, Settings2, ShieldCheck, Smile, Sparkles, Sun, Trash2, Type, Volume2, X } from 'lucide-react';
import { colors, decorColors, eyeColors, worlds } from '../data';
import { LumiIcon, MoriMark } from './Brand';
import { isNative } from '../lib/platform';
import type { ConnectionConfig, ConnectionStatus, Emotion, FontStyle, HomeSettings, Memory, Panel, ProactiveFrequency, Profile, TextSize, ThemeColor, ThemeMode, WorldId } from '../types';

export function PanelShell({ panel, title, eyebrow, onClose, children }: { panel: Panel; title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('.panel-close')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const focusable = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, summary, [tabindex="0"]');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); }
        if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);

  return <motion.div className={`panel-backdrop ${panel === 'worlds' ? 'centered' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section className={`app-panel ${panel === 'worlds' ? 'worlds-panel' : ''} ${panel === 'utilities' ? 'utilities-panel-shell' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby="panel-title" initial={panel === 'worlds' ? { y: 24, scale: 0.98 } : { x: 45 }} animate={{ x: 0, y: 0, scale: 1 }} exit={panel === 'worlds' ? { y: 20, scale: 0.98 } : { x: 45 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
      <div className="panel-top"><MoriMark size={25} /><button className="icon-button panel-close" onClick={onClose} aria-label="Close panel"><X size={21} /></button></div>
      <header className="panel-heading"><p className="eyebrow">{eyebrow}</p><h2 id="panel-title">{title}</h2></header>
      {children}
    </motion.section>
  </motion.div>;
}

export function WorldsPanel({ selected, onSelect, home, onHomeChange }: { selected: WorldId; onSelect: (world: WorldId) => void; home: HomeSettings; onHomeChange: (home: HomeSettings) => void }) {
  return <><p className="panel-description">A new view. The same good company. Where shall we go?</p><div className="world-options">{worlds.map((world, index) => <motion.button key={world.id} className={`world-option ${selected === world.id ? 'selected' : ''}`} onClick={() => onSelect(world.id)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}>
    <div className="world-option-image"><img src={world.image} alt={world.description} />{selected === world.id && <span className="world-selected"><Check size={13} />YOU ARE HERE</span>}<span className="world-travel"><ArrowRight size={20} /></span></div><h3>{world.name}</h3><p>{world.subtitle}</p>
  </motion.button>)}</div>
    <div className="world-preferences"><div><span className="field-label">A light for every mood</span><div className="segmented-control">{(['day', 'golden', 'night'] as const).map((daylight) => <button key={daylight} className={home.daylight === daylight ? 'selected' : ''} onClick={() => onHomeChange({ ...home, daylight })}>{daylight === 'day' ? 'Daylight' : daylight === 'golden' ? 'Golden hour' : 'Moonlight'}</button>)}</div></div><div><span className="field-label">A little atmosphere</span><div className="segmented-control">{(['clear', 'fireflies', 'rain'] as const).map((weather) => <button key={weather} className={home.weather === weather ? 'selected' : ''} onClick={() => onHomeChange({ ...home, weather })}>{weather === 'clear' ? 'Still' : weather === 'fireflies' ? 'Fireflies' : 'Gentle rain'}</button>)}</div></div><div><span className="field-label">Furniture finish</span><div className="decor-options">{(['oak', 'cream', 'walnut'] as const).map((decor) => <button key={decor} className={home.decor === decor ? 'selected' : ''} onClick={() => onHomeChange({ ...home, decor })}><span style={{ background: decorColors[decor] }} />{decor === 'oak' ? 'Light oak' : decor === 'cream' ? 'Soft cream' : 'Walnut'}{home.decor === decor && <Check size={12} />}</button>)}</div></div><div className="autonomy-setting"><div><strong>A life of his own</strong><p>Let him wander, read, and tend his plant when you're taking a pause.</p></div><button className={`toggle ${home.autonomous ? 'on' : ''}`} role="switch" aria-checked={home.autonomous} aria-label="Autonomous daily routines" onClick={() => onHomeChange({ ...home, autonomous: !home.autonomous })}><span /></button></div></div>
    <p className="panel-footnote"><Heart size={14} />Every little ritual makes it feel more like home.</p></>;
}

export function CustomizePanel({ profile, onChange, onEmotion }: { profile: Profile; onChange: (profile: Profile) => void; onEmotion: (emotion: Emotion) => void }) {
  const [expression, setExpression] = useState<Emotion>('happy');
  const emotions: { id: Emotion; label: string; icon: typeof Smile }[] = [{ id: 'happy', label: 'Happy', icon: Smile }, { id: 'curious', label: 'Curious', icon: Search }, { id: 'calm', label: 'Calm', icon: Moon }, { id: 'love', label: 'Loved', icon: Heart }, { id: 'excited', label: 'Excited', icon: Sparkles }];
  return <><p className="panel-description">Little details that make your companion feel like yours.</p><div className="customize-avatar"><LumiIcon size={80} color={colors[profile.color].main} /><div><h3>{profile.companionName}</h3><p>Your one-of-a-kind little companion</p></div></div>
    <div className="form-section"><label className="field-label" htmlFor="companion-name">Call me...</label><input id="companion-name" className="text-field" value={profile.companionName} maxLength={20} onChange={(event) => onChange({ ...profile, companionName: event.target.value || 'Lumi' })} /></div>
    <div className="form-section"><span className="field-label">A little color</span><div className="color-options">{(Object.keys(colors) as Profile['color'][]).map((color) => <button key={color} className={profile.color === color ? 'selected' : ''} onClick={() => onChange({ ...profile, color })} aria-pressed={profile.color === color}><span style={{ background: colors[color].main }}>{profile.color === color && <Check size={18} />}</span>{colors[color].label}</button>)}</div></div>
    <div className="form-section"><span className="field-label">His signature detail</span><div className="accessory-options">{(['none', 'glasses', 'scarf', 'headphones'] as const).map((accessory) => <button key={accessory} className={profile.accessory === accessory ? 'selected' : ''} onClick={() => onChange({ ...profile, accessory })}>{accessory === 'none' ? 'Just me' : accessory === 'glasses' ? 'Glasses' : accessory === 'scarf' ? 'Cozy scarf' : 'Headphones'}</button>)}</div></div>
    <div className="form-section"><span className="field-label">A little spark on top</span><div className="segmented-control">{(['sprout', 'star', 'orb'] as const).map((antenna) => <button key={antenna} className={profile.antenna === antenna ? 'selected' : ''} onClick={() => onChange({ ...profile, antenna })}>{antenna === 'sprout' ? 'Little sprout' : antenna === 'star' ? 'Starlight' : 'Glow orb'}</button>)}</div></div>
    <div className="form-section"><span className="field-label">The light in his eyes</span><div className="eye-color-options">{(Object.keys(eyeColors) as Profile['eyeColor'][]).map((eyeColor) => <button key={eyeColor} aria-label={`${eyeColor} eyes`} aria-pressed={profile.eyeColor === eyeColor} className={profile.eyeColor === eyeColor ? 'selected' : ''} onClick={() => onChange({ ...profile, eyeColor })} style={{ '--eye-color': eyeColors[eyeColor] } as CSSProperties}><i /><i /><span>{eyeColor}</span></button>)}</div></div>
    <div className="form-section"><span className="field-label">A softer surface</span><div className="segmented-control">{(['ceramic', 'clay', 'chrome'] as const).map((finish) => <button key={finish} className={profile.finish === finish ? 'selected' : ''} onClick={() => onChange({ ...profile, finish })}>{finish === 'ceramic' ? 'Ceramic' : finish === 'clay' ? 'Soft clay' : 'Pearl chrome'}</button>)}</div></div>
    <div className="form-section customization-slider"><label className="field-label" htmlFor="lumi-size">A little different in size<span>{Math.round(profile.size * 100)}%</span></label><input id="lumi-size" type="range" min="0.8" max="1.15" step="0.05" value={profile.size} onChange={(event) => onChange({ ...profile, size: Number(event.target.value) })} /></div>
    <div className="form-section customization-slider"><label className="field-label" htmlFor="motion-speed">His own little rhythm<span>{profile.motionSpeed < 0.9 ? 'Dreamy' : profile.motionSpeed > 1.1 ? 'Lively' : 'Easygoing'}</span></label><input id="motion-speed" type="range" min="0.65" max="1.35" step="0.05" value={profile.motionSpeed} onChange={(event) => onChange({ ...profile, motionSpeed: Number(event.target.value) })} /></div>
    <div className="form-section"><span className="field-label">My personality</span><div className="segmented-control">{(['Gentle', 'Playful', 'Curious'] as const).map((personality) => <button key={personality} className={profile.personality === personality ? 'selected' : ''} onClick={() => onChange({ ...profile, personality })}>{personality}</button>)}</div><p className="field-hint">Sets the tone of local-preview conversations. Live personality is managed in your Xiaozhi account.</p></div>
    <div className="form-section"><span className="field-label">A face for every feeling</span><div className="expression-options">{emotions.map(({ id, label, icon: Icon }) => <button key={id} className={expression === id ? 'selected' : ''} onClick={() => { setExpression(id); onEmotion(id); }}><Icon size={21} strokeWidth={1.5} /><span>{label}</span></button>)}</div></div>
    <div className="form-section your-name-section"><label className="field-label" htmlFor="user-name">And what should I call you?</label><input id="user-name" className="text-field" value={profile.userName} maxLength={24} onChange={(event) => onChange({ ...profile, userName: event.target.value || 'Friend' })} /></div><p className="panel-footnote"><Check size={14} />Your little details are saved automatically.</p></>;
}

export function MemoriesPanel({ memories, companionName, onDelete, onClose }: { memories: Memory[]; companionName: string; onDelete: (id: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const filtered = memories.filter((memory) => memory.text.toLowerCase().includes(search.toLowerCase()));
  return <><p className="panel-description">Some words are worth keeping. These are yours.</p>{memories.length > 0 ? <>
    <label className="memory-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a little memory..." aria-label="Search saved memories" /></label><div className="memory-list">{filtered.map((memory) => <article className="saved-memory" key={memory.id}><div><Bookmark size={15} /><span>{new Date(memory.savedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span><button className="icon-button" onClick={() => onDelete(memory.id)} aria-label="Delete this memory"><Trash2 size={15} /></button></div><p>{memory.text}</p></article>)}{filtered.length === 0 && <p className="no-results">No memories found. Try a different little word.</p>}</div><p className="panel-footnote"><ShieldCheck size={14} />Saved privately in this browser.</p>
  </> : <div className="empty-memories"><div className="empty-memory-art"><Bookmark size={42} strokeWidth={1} /><span><Leaf size={19} /></span></div><h3>A little space for keepsakes.</h3><p>When something {companionName} says makes you smile, tap the bookmark below the message. You'll find it waiting here.</p><button className="primary-button" onClick={onClose}>Make a little memory<ArrowRight size={16} /></button></div>}</>;
}

interface SettingsProps {
  config: ConnectionConfig;
  onConfig: (config: ConnectionConfig) => void;
  status: ConnectionStatus;
  error: string;
  onConnect: () => void;
  onDisconnect: () => void;
  voiceEnabled: boolean;
  onVoiceToggle: () => void;
  continuousListening: boolean;
  onContinuousListeningToggle: () => void;
  proactiveEnabled: boolean;
  onProactiveToggle: () => void;
  proactiveFrequency: ProactiveFrequency;
  onProactiveFrequency: (value: ProactiveFrequency) => void;
  themeMode: ThemeMode;
  onThemeMode: (value: ThemeMode) => void;
  themeColor: ThemeColor;
  onThemeColor: (value: ThemeColor) => void;
  textSize: TextSize;
  onTextSize: (value: TextSize) => void;
  fontStyle: FontStyle;
  onFontStyle: (value: FontStyle) => void;
  reducedMotion: boolean;
  onMotionToggle: () => void;
  onReset: () => void;
}

export function SettingsPanel({ config, onConfig, status, error, onConnect, onDisconnect, voiceEnabled, onVoiceToggle, continuousListening, onContinuousListeningToggle, proactiveEnabled, onProactiveToggle, proactiveFrequency, onProactiveFrequency, themeMode, onThemeMode, themeColor, onThemeColor, textSize, onTextSize, fontStyle, onFontStyle, reducedMotion, onMotionToggle, onReset }: SettingsProps) {
  const [showToken, setShowToken] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const locked = status === 'connecting' || status === 'connected';
  const providerName = config.provider === 'openai-realtime' ? 'OpenAI Realtime' : 'Xiaozhi AI';

  function submit(event: FormEvent) { event.preventDefault(); onConnect(); }
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(config.systemPrompt);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 2200);
    } catch { setCopiedPrompt(false); }
  }

  return <>
    <p className="panel-description">Choose the realtime voice brain behind Lumi. Xiaozhi stays supported, while OpenAI Realtime gives you a second speech-to-speech provider with the same Lumi interface.</p>
    <div className={`connection-status status-${status}`}>
      <span className="connection-status-icon">{status === 'connecting' ? <LoaderCircle className="spin" size={20} /> : <PlugZap size={20} />}</span>
      <div><strong>{status === 'connected' ? `${providerName} is live` : status === 'connecting' ? `Connecting to ${providerName}...` : status === 'error' ? 'Not connected yet' : 'Enjoying the local preview'}</strong><p>{status === 'connected' ? 'Live voice, tools, interruptions, and proactive conversation' : 'Connect below for open-ended AI conversations'}</p></div><span className="presence-dot" />
    </div>

    <form className="connection-form" onSubmit={submit}>
      <label className="field-label" htmlFor="ai-provider">Voice AI provider</label>
      <select id="ai-provider" className="text-field" value={config.provider} onChange={(event) => onConfig({ ...config, provider: event.target.value as ConnectionConfig['provider'] })} disabled={locked}>
        <option value="xiaozhi">Xiaozhi AI</option>
        <option value="openai-realtime">OpenAI Realtime (speech-to-speech)</option>
      </select>
      <p className="field-hint">Lumi keeps the same UI, tools, memories, hands-free mode, and proactive controls when you change providers.</p>
      <p className="provider-research-note"><strong>Provider options researched:</strong> OpenAI Realtime is implemented here as the second provider. GPT-Live 1 is the strongest future option for highly natural full-duplex conversation; Gemini Live and Qwen Omni Realtime are also viable adapters, with Qwen especially attractive for English/Chinese voice use.</p>

      {config.provider === 'xiaozhi' ? <>
        {isNative ? <>
          <label className="field-label" htmlFor="xiaozhi-url">Xiaozhi WebSocket URL</label>
          <input id="xiaozhi-url" className="text-field mono-field" type="url" placeholder="wss://api.tenclass.net/xiaozhi/v1/" value={config.xiaozhiUrl} onChange={(event) => onConfig({ ...config, xiaozhiUrl: event.target.value })} required disabled={locked} />
          <p className="field-hint">Android connects directly to Xiaozhi with a native secure WebSocket. Keep the default URL unless your paired device uses a self-hosted Xiaozhi server.</p>
        </> : <>
          <label className="field-label" htmlFor="bridge-url">Bridge WebSocket URL</label>
          <input id="bridge-url" className="text-field mono-field" type="url" placeholder="wss://your-bridge.example.com" value={config.bridgeUrl} onChange={(event) => onConfig({ ...config, bridgeUrl: event.target.value })} required disabled={locked} />
          <p className="field-hint">Web and desktop Xiaozhi builds use the included bridge because browser WebSockets cannot attach Xiaozhi's device authentication headers.</p>
        </>}
        <label className="field-label" htmlFor="device-id">Paired Device ID</label>
        <input id="device-id" className="text-field mono-field" placeholder="aa:bb:cc:dd:ee:ff" value={config.deviceId} onChange={(event) => onConfig({ ...config, deviceId: event.target.value })} required disabled={locked} maxLength={128} />
        <label className="field-label" htmlFor="client-id">Paired Client ID</label>
        <input id="client-id" className="text-field mono-field" placeholder="Your paired device UUID" value={config.clientId} onChange={(event) => onConfig({ ...config, clientId: event.target.value })} required disabled={locked} maxLength={128} />
        <label className="field-label" htmlFor="access-token">Access token<span>Kept in this session only</span></label>
        <div className="password-field"><input id="access-token" className="text-field mono-field" type={showToken ? 'text' : 'password'} placeholder="Your paired Xiaozhi token" value={config.token} onChange={(event) => onConfig({ ...config, token: event.target.value })} disabled={locked} autoComplete="off" /><button type="button" onClick={() => setShowToken(!showToken)} aria-label={showToken ? 'Hide token' : 'Show token'}>{showToken ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        <label className="field-label" htmlFor="asr-mode">Speech recognition mode</label>
        <select id="asr-mode" className="text-field" value={config.asrMode} onChange={(event) => onConfig({ ...config, asrMode: event.target.value as ConnectionConfig['asrMode'] })} disabled={locked}>
          <option value="server">Server/console language (default)</option>
          <option value="bilingual-auto">Bilingual auto-detect (English + Chinese)</option>
        </select>
        {config.asrMode === 'bilingual-auto' && <>
          <label className="field-label" htmlFor="asr-languages">Preferred recognition languages</label>
          <input id="asr-languages" className="text-field mono-field" value={config.asrLanguages} onChange={(event) => onConfig({ ...config, asrLanguages: event.target.value })} placeholder="zh,en" disabled={locked} maxLength={64} />
          <p className="field-hint"><strong>Bilingual mode needs a compatible/self-hosted Xiaozhi backend.</strong> The public xiaozhi.me service controls ASR language on its server.</p>
        </>}
      </> : <>
        <label className="field-label" htmlFor="openai-token-url">Realtime token endpoint</label>
        <input id="openai-token-url" className="text-field mono-field" type="url" placeholder="https://your-server.example.com/token" value={config.openaiTokenUrl} onChange={(event) => onConfig({ ...config, openaiTokenUrl: event.target.value })} required disabled={locked} />
        <p className="field-hint">Keep your real OpenAI API key on your server. Lumi requests a short-lived Realtime client secret from this endpoint; the API key is never bundled into the app.</p>
        <label className="field-label" htmlFor="openai-voice">Realtime voice</label>
        <select id="openai-voice" className="text-field" value={config.openaiVoice} onChange={(event) => onConfig({ ...config, openaiVoice: event.target.value as ConnectionConfig['openaiVoice'] })} disabled={locked}>
          <option value="marin">Marin — recommended</option><option value="cedar">Cedar — recommended</option><option value="coral">Coral</option><option value="sage">Sage</option><option value="verse">Verse</option><option value="alloy">Alloy</option><option value="ash">Ash</option><option value="ballad">Ballad</option><option value="echo">Echo</option><option value="shimmer">Shimmer</option>
        </select>
        <p className="field-hint">The included <code>server/openai-realtime-token-server.mjs</code> creates secure short-lived client secrets for <code>gpt-realtime-2.1</code>.</p>
      </>}

      {error && <p className="connection-error" role="alert">{error}</p>}
      {status === 'connected' ? <button type="button" className="secondary-button full-width" onClick={onDisconnect}>Disconnect & return to local preview</button> : <button className="primary-button full-width" disabled={status === 'connecting'} type="submit">{status === 'connecting' ? <><LoaderCircle size={17} className="spin" />Connecting...</> : <><PlugZap size={17} />Connect to {providerName}<ArrowRight size={16} /></>}</button>}
      {status === 'connecting' && <button type="button" className="text-button" onClick={onDisconnect}>Cancel connection</button>}
    </form>

    <div className="preferences-section proactive-prompt-settings">
      <h3>Lumi's conversation brain</h3>
      <p className="field-hint">This prompt tells the AI to lead conversations naturally instead of always waiting for you to pick the next topic.</p>
      <label className="field-label" htmlFor="lumi-system-prompt">System / role prompt</label>
      <textarea id="lumi-system-prompt" className="text-field prompt-field" rows={12} value={config.systemPrompt} onChange={(event) => onConfig({ ...config, systemPrompt: event.target.value.slice(0, 12000) })} disabled={locked} />
      <div className="prompt-actions"><button type="button" className="secondary-button" onClick={() => void copyPrompt()}><Copy size={15} />{copiedPrompt ? 'Copied prompt' : 'Copy prompt'}</button></div>
      {config.provider === 'xiaozhi' ? <p className="field-hint"><strong>Xiaozhi hosted service:</strong> paste this into the agent's role/system prompt in the Xiaozhi console. The public WebSocket protocol does not let the phone replace that server prompt. For self-hosted <code>xiaozhi-esp32-server</code>, put it under <code>prompt:</code>. If wake-up responses are still generic, check the server's wake-up greeting/cache settings.</p> : <p className="field-hint"><strong>OpenAI Realtime:</strong> this prompt is sent automatically when the Realtime session is created, including the proactive-conversation rules.</p>}
    </div>

    <details className="connection-guide"><summary>Provider setup notes<ChevronDown size={16} /></summary><div>
      {config.provider === 'xiaozhi' ? <>
        <p>Use your paired Xiaozhi Device ID, Client ID, and token. Android can connect directly to the official secure WebSocket.</p>
        <p>For self-hosted bilingual recognition, configure an automatic-language ASR rather than locking the server to one language.</p>
        <a href="https://xiaozhi.me/console/agents" target="_blank" rel="noreferrer">Open Xiaozhi agent console<ExternalLink size={13} /></a>
      </> : <>
        <p>1. Copy <code>server/openai-realtime.env.example</code> to <code>.env.openai</code> and add your server-side OpenAI API key.</p>
        <p>2. Run <code>npm run voice:openai</code>.</p>
        <p>3. For Android outside your PC, expose that token service through HTTPS and enter its <code>/token</code> URL above.</p>
        <p>The phone receives only a short-lived client secret and then establishes the realtime WebRTC audio connection.</p>
      </>}
    </div></details>

    <div className="preferences-section"><h3>The little things</h3>
      <div className="preference-row"><Volume2 size={18} /><div><strong>Companion voice</strong><p>Use the connected AI provider's natural voice instead of system TTS.</p></div><button role="switch" aria-checked={voiceEnabled} aria-label="Companion voice" className={`toggle ${voiceEnabled ? 'on' : ''}`} onClick={onVoiceToggle}><span /></button></div>
      <div className="preference-row"><Mic size={18} /><div><strong>Hands-free listening</strong><p>Use the ∞ button on Lumi’s main screen for continuous listening. It pauses automatically while Lumi replies and resumes when ready.</p></div><button role="switch" aria-checked={continuousListening} aria-label="Hands-free listening" className={`toggle ${continuousListening ? 'on' : ''}`} onClick={onContinuousListeningToggle}><span /></button></div>
      <div className="preference-row"><Sparkles size={18} /><div><strong>Proactive conversations</strong><p>Let the connected AI lead conversations after quiet moments and pull fresh relevant news/trending topics when the current thread runs out.</p></div><button role="switch" aria-checked={proactiveEnabled} aria-label="Proactive conversations" className={`toggle ${proactiveEnabled ? 'on' : ''}`} onClick={onProactiveToggle}><span /></button></div>
      {proactiveEnabled && <div className="preference-subsetting"><label className="field-label" htmlFor="proactive-frequency">How chatty should Lumi be?</label><select id="proactive-frequency" className="text-field" value={proactiveFrequency} onChange={(event) => onProactiveFrequency(event.target.value as ProactiveFrequency)}><option value="calm">Calm — only occasionally</option><option value="balanced">Balanced — a few natural check-ins</option><option value="lively">Lively — more spontaneous conversation</option></select><p className="field-hint">Fresh-topic radar runs automatically with proactive mode. Lumi caches public news/trend signals and lets the connected AI choose one useful topic instead of dumping headlines.</p></div>}
      <div className="preference-row"><Settings2 size={18} /><div><strong>Gentler motion</strong><p>Less animation, the same good company</p></div><button role="switch" aria-checked={reducedMotion} aria-label="Reduce motion" className={`toggle ${reducedMotion ? 'on' : ''}`} onClick={onMotionToggle}><span /></button></div>
    </div>

    <div className="preferences-section appearance-settings"><h3>Appearance</h3>
      <div className="appearance-setting"><div className="appearance-label"><Palette size={18} /><div><strong>Theme</strong><p>Switch between a bright or darker interface.</p></div></div><div className="segmented-setting" role="group" aria-label="Theme mode"><button type="button" className={themeMode === 'light' ? 'active' : ''} onClick={() => onThemeMode('light')}><Sun size={14} />Light</button><button type="button" className={themeMode === 'dark' ? 'active' : ''} onClick={() => onThemeMode('dark')}><Moon size={14} />Dark</button></div></div>
      <div className="appearance-setting"><div className="appearance-label"><Sparkles size={18} /><div><strong>Accent colour</strong><p>Choose the colour used for buttons, highlights, and controls.</p></div></div><div className="theme-swatches" role="group" aria-label="Accent colour">{(Object.keys(colors) as ThemeColor[]).map((name) => <button key={name} type="button" className={themeColor === name ? 'active' : ''} onClick={() => onThemeColor(name)} aria-label={colors[name].label} title={colors[name].label} style={{ '--swatch': colors[name].main } as CSSProperties}><span /></button>)}</div></div>
      <div className="appearance-setting appearance-select-row"><div className="appearance-label"><Type size={18} /><div><strong>Text size</strong><p>Make labels and conversation text easier to read.</p></div></div><select className="text-field compact-select" value={textSize} onChange={(event) => onTextSize(event.target.value as TextSize)} aria-label="Text size"><option value="small">Small</option><option value="normal">Default</option><option value="large">Large</option><option value="xlarge">Extra large</option></select></div>
      <div className="appearance-setting appearance-select-row"><div className="appearance-label"><Smile size={18} /><div><strong>Font style</strong><p>Choose the overall typeface feel.</p></div></div><select className="text-field compact-select" value={fontStyle} onChange={(event) => onFontStyle(event.target.value as FontStyle)} aria-label="Font style"><option value="soft">Soft — DM Sans</option><option value="clean">Clean — Manrope</option><option value="system">System</option></select></div>
    </div>

    <div className="reset-section">{confirmReset ? <><p>Clear this browser's conversations, memories, and personalizations? This cannot be undone.</p><div><button className="text-button" onClick={() => setConfirmReset(false)}>Keep my little world</button><button className="text-button danger" onClick={() => { onReset(); setConfirmReset(false); }}>Yes, start fresh</button></div></> : <button className="text-button" onClick={() => setConfirmReset(true)}><Trash2 size={14} />Reset local data</button>}</div>
  </>;
}
