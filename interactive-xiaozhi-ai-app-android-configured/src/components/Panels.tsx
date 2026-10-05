import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Bookmark, Check, ChevronDown, ExternalLink, Eye, EyeOff, Heart, Leaf, LoaderCircle, Moon, PlugZap, Search, Settings2, ShieldCheck, Smile, Sparkles, Trash2, Volume2, X } from 'lucide-react';
import { colors, decorColors, eyeColors, worlds } from '../data';
import { LumiIcon, MoriMark } from './Brand';
import { isNative } from '../lib/platform';
import type { ConnectionConfig, ConnectionStatus, Emotion, HomeSettings, Memory, Panel, Profile, WorldId } from '../types';

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
    <motion.section className={`app-panel ${panel === 'worlds' ? 'worlds-panel' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby="panel-title" initial={panel === 'worlds' ? { y: 24, scale: 0.98 } : { x: 45 }} animate={{ x: 0, y: 0, scale: 1 }} exit={panel === 'worlds' ? { y: 20, scale: 0.98 } : { x: 45 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
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
  reducedMotion: boolean;
  onMotionToggle: () => void;
  onReset: () => void;
}

export function SettingsPanel({ config, onConfig, status, error, onConnect, onDisconnect, voiceEnabled, onVoiceToggle, reducedMotion, onMotionToggle, onReset }: SettingsProps) {
  const [showToken, setShowToken] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const locked = status === 'connecting' || status === 'connected';
  function submit(event: FormEvent) { event.preventDefault(); onConnect(); }
  return <><p className="panel-description">A familiar little face. A real AI conversation. Connect your paired Xiaozhi device to bring them together.</p>
    <div className={`connection-status status-${status}`}><span className="connection-status-icon">{status === 'connecting' ? <LoaderCircle className="spin" size={20} /> : <PlugZap size={20} />}</span><div><strong>{status === 'connected' ? 'Your connection is alive' : status === 'connecting' ? 'Finding your connection...' : status === 'error' ? 'Not connected yet' : 'Enjoying the local preview'}</strong><p>{status === 'connected' ? 'Live text, voice playback, and emotions' : 'Connect below for open-ended AI conversations'}</p></div><span className="presence-dot" /></div>
    <form className="connection-form" onSubmit={submit}>
      {isNative ? <>
        <label className="field-label" htmlFor="xiaozhi-url">Xiaozhi WebSocket URL</label><input id="xiaozhi-url" className="text-field mono-field" type="url" placeholder="wss://api.xiaozhi.me/xiaozhi/v1/" value={config.xiaozhiUrl} onChange={(event) => onConfig({ ...config, xiaozhiUrl: event.target.value })} required disabled={locked} />
        <p className="field-hint">Android connects directly to Xiaozhi with a native secure WebSocket. No PC bridge, Cloudflare tunnel, or ALLOWED_ORIGINS setup is needed. Keep the default URL unless your paired device uses a self-hosted Xiaozhi server.</p>
      </> : <>
        <label className="field-label" htmlFor="bridge-url">Bridge WebSocket URL</label><input id="bridge-url" className="text-field mono-field" type="url" placeholder="wss://your-bridge.example.com" value={config.bridgeUrl} onChange={(event) => onConfig({ ...config, bridgeUrl: event.target.value })} required disabled={locked} />
        <p className="field-hint">Web and desktop browser builds still use the included Mori bridge because browser WebSockets cannot attach Xiaozhi's required authentication headers.</p>
      </>}
      <label className="field-label" htmlFor="device-id">Paired Device ID</label><input id="device-id" className="text-field mono-field" placeholder="aa:bb:cc:dd:ee:ff" value={config.deviceId} onChange={(event) => onConfig({ ...config, deviceId: event.target.value })} required disabled={locked} maxLength={128} />
      <label className="field-label" htmlFor="client-id">Paired Client ID</label><input id="client-id" className="text-field mono-field" placeholder="Your paired device UUID" value={config.clientId} onChange={(event) => onConfig({ ...config, clientId: event.target.value })} required disabled={locked} maxLength={128} />
      <label className="field-label" htmlFor="access-token">Access token<span>Kept in this session only</span></label><div className="password-field"><input id="access-token" className="text-field mono-field" type={showToken ? 'text' : 'password'} placeholder="Your paired Xiaozhi token" value={config.token} onChange={(event) => onConfig({ ...config, token: event.target.value })} disabled={locked} autoComplete="off" /><button type="button" onClick={() => setShowToken(!showToken)} aria-label={showToken ? 'Hide token' : 'Show token'}>{showToken ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
      {error && <p className="connection-error" role="alert">{error}</p>}
      {status === 'connected' ? <button type="button" className="secondary-button full-width" onClick={onDisconnect}>Disconnect & return to local preview</button> : <button className="primary-button full-width" disabled={status === 'connecting'} type="submit">{status === 'connecting' ? <><LoaderCircle size={17} className="spin" />Connecting...</> : <><PlugZap size={17} />Connect to Xiaozhi<ArrowRight size={16} /></>}</button>}
      {status === 'connecting' && <button type="button" className="text-button" onClick={onDisconnect}>Cancel connection</button>}
    </form>
    <details className="connection-guide"><summary>Need a little help connecting?<ChevronDown size={16} /></summary><div>{isNative ? <><p>1. Enter the Device ID, Client ID, and access token from the same paired Xiaozhi device.</p><p>2. Leave the Xiaozhi WebSocket URL at <code>wss://api.xiaozhi.me/xiaozhi/v1/</code> unless your device was paired to a different/self-hosted server.</p><p>3. Tap Connect to Xiaozhi. The Android app sends the required Authorization, Device-Id, Client-Id, and Protocol-Version headers natively, so no bridge or tunnel is required.</p></> : <><p>1. Copy your existing paired Device ID, Client ID, and token from your Xiaozhi setup.</p><p>2. Run the included bridge:</p><code>node --env-file=.env server/xiaozhi-bridge.mjs</code><p>3. Add your app origin to ALLOWED_ORIGINS and enter the bridge's ws:// or wss:// URL above.</p></>}<p>{isNative ? 'Voice input uses Android speech recognition. Your speech service may require internet access.' : 'Voice input uses your browser\'s speech recognition.'} Xiaozhi replies stream back as text, emotions, and Opus audio.</p><a href="https://xiaozhi.dev/en/docs/development/websocket/" target="_blank" rel="noreferrer">Xiaozhi protocol documentation<ExternalLink size={13} /></a></div></details>
    <div className="preferences-section"><h3>The little things</h3><div className="preference-row"><Volume2 size={18} /><div><strong>Companion voice</strong><p>Let your little companion speak</p></div><button role="switch" aria-checked={voiceEnabled} aria-label="Companion voice" className={`toggle ${voiceEnabled ? 'on' : ''}`} onClick={onVoiceToggle}><span /></button></div><div className="preference-row"><Settings2 size={18} /><div><strong>Gentler motion</strong><p>Less animation, the same good company</p></div><button role="switch" aria-checked={reducedMotion} aria-label="Reduce motion" className={`toggle ${reducedMotion ? 'on' : ''}`} onClick={onMotionToggle}><span /></button></div></div>
    <div className="reset-section">{confirmReset ? <><p>Clear this browser's conversations, memories, and personalizations? This cannot be undone.</p><div><button className="text-button" onClick={() => setConfirmReset(false)}>Keep my little world</button><button className="text-button danger" onClick={() => { onReset(); setConfirmReset(false); }}>Yes, start fresh</button></div></> : <button className="text-button" onClick={() => setConfirmReset(true)}><Trash2 size={14} />Reset local data</button>}</div>
  </>;
}