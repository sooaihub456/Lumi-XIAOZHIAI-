import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, ArrowUpRight, Bookmark, Check, ChevronDown, Copy, Download, Ellipsis, Leaf, MessageCircle, Mic, Plus, Sparkles, Volume2, X } from 'lucide-react';
import { LumiIcon } from './Brand';
import { colors } from '../data';
import { copyText, exportFile, isShareCancellation } from '../lib/files';
import type { ConnectionStatus, Memory, Message, Profile } from '../types';

interface ChatPanelProps {
  messages: Message[];
  profile: Profile;
  memories: Memory[];
  busy: boolean;
  voiceActive: boolean;
  listening: boolean;
  continuousListening: boolean;
  interim: string;
  status: ConnectionStatus;
  mobileOpen: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  onVoice: () => void;
  onSave: (message: Message) => void;
  onSpeak: (text: string) => void;
  onNew: () => void;
  onConnect: () => void;
  notify: (text: string) => void;
}

export default function ChatPanel({ messages, profile, memories, busy, voiceActive, listening, continuousListening, interim, status, mobileOpen, onClose, onSend, onVoice, onSave, onSpeak, onNew, onConnect, notify }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [menu, setMenu] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy, mobileOpen]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [menu]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!input.trim() || busy) return;
    onSend(input.trim());
    setInput('');
  }

  async function copyMessage(message: Message) {
    try {
      await copyText(message.text);
      setCopied(message.id);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1800);
    } catch { notify('Clipboard access is unavailable. You can select and copy the message instead.'); }
  }

  async function exportConversation() {
    const content = `Mori | A conversation with ${profile.companionName}\n\n${messages.map((message) => `${message.role === 'user' ? profile.userName : profile.companionName}\n${message.text}`).join('\n\n')}`;
    setMenu(false);
    try {
      await exportFile(`mori-conversation-${new Date().toISOString().slice(0, 10)}.txt`, new Blob([content], { type: 'text/plain' }));
    } catch (error) {
      if (!isShareCancellation(error)) notify('This conversation could not be exported. Please try again.');
    }
  }

  return (
    <aside className={`chat-panel ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Conversation with your companion">
      <div className="chat-heading">
        <div><h2>A little conversation</h2><p><span className="presence-dot" />{profile.companionName} is here for you</p></div>
        <div className="chat-heading-actions">
          <div className="chat-menu-wrap" ref={menuRef}>
            <button className="icon-button" aria-label="Conversation options" aria-expanded={menu} onClick={() => setMenu(!menu)}><Ellipsis size={20} /></button>
            {menu && <div className="dropdown-menu"><button onClick={() => { onNew(); setMenu(false); }}><Plus size={15} />New conversation</button><button onClick={exportConversation}><Download size={15} />Export conversation</button></div>}
          </div>
          <button className="icon-button close-mobile-chat" onClick={onClose} aria-label="Close conversation"><X size={20} /></button>
        </div>
      </div>
      <div className="chat-scroll">
        <div className="chat-date"><span />A MOMENT FOR YOU<span /></div>
        <div className="messages" role="log" aria-live="polite" aria-relevant="additions text">
          <AnimatePresence initial={false}>
            {messages.map((message) => {
              const saved = memories.some((memory) => memory.id === message.id);
              return <motion.article key={message.id} className={`message message-${message.role}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
                <div className="message-author">{message.role === 'assistant' ? <LumiIcon size={27} color={colors[profile.color].main} /> : <span className="mini-user">{profile.userName.slice(0, 1).toUpperCase()}</span>}<span>{message.role === 'assistant' ? profile.companionName : 'You'}</span><time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>
                <div className="message-bubble">{message.text}</div>
                {message.role === 'assistant' && <div className="message-tools">
                  <button onClick={() => onSpeak(message.text)} aria-label="Read this message aloud" title="Read aloud"><Volume2 size={13} /></button>
                  <button onClick={() => void copyMessage(message)} aria-label="Copy message" title="Copy message">{copied === message.id ? <Check size={13} /> : <Copy size={13} />}</button>
                  <button className={saved ? 'is-saved' : ''} onClick={() => onSave(message)} aria-label={saved ? 'Remove saved memory' : 'Save as a memory'} title={saved ? 'Saved to memories' : 'Save a little memory'}><Bookmark size={13} fill={saved ? 'currentColor' : 'none'} />{saved && <span>Saved</span>}</button>
                </div>}
              </motion.article>;
            })}
          </AnimatePresence>
          {busy && <div className="typing" aria-label={`${profile.companionName} is thinking`}><LumiIcon size={26} /><span className="typing-dots"><i /><i /><i /></span><span className="typing-label">a little thought...</span></div>}
        </div>
        {messages.length === 1 && !busy && <div className="conversation-intro"><div className="intro-sprig"><Leaf size={20} strokeWidth={1.3} /></div><p>Big feelings. Small talk.<br />There is room for all of it here.</p></div>}
        <div ref={bottom} />
      </div>
      <div className="chat-bottom">
        {messages.length < 4 && <div className="conversation-starters"><p>A LITTLE INSPIRATION</p><button disabled={busy} onClick={() => onSend("Let's take a deep breath")}><Leaf size={15} /><span>Let's take a deep breath</span><ArrowUpRight size={15} /></button><button disabled={busy} onClick={() => onSend('Tell me something good')}><Sparkles size={15} /><span>Tell me something good</span><ArrowUpRight size={15} /></button></div>}
        {voiceActive && <div className="listening-preview"><span className="sound-bars"><i /><i /><i /><i /></span><span>{listening ? (interim || (continuousListening ? 'Hands-free listening is on. Speak whenever you are ready...' : 'Listening. Take your time...')) : continuousListening ? `${profile.companionName} is replying. Listening will resume automatically...` : 'Listening is paused...'}</span><button onClick={onVoice} aria-label="Stop listening"><X size={14} /></button></div>}
        <form className="message-input" onSubmit={submit}>
          <textarea ref={textarea} value={input} onChange={(event) => setInput(event.target.value)} placeholder={`Say a little something...`} aria-label={`Message ${profile.companionName}`} maxLength={2000} rows={2} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
          <div className="input-toolbar"><span>Make yourself at home.</span><button type="button" className={`input-mic ${voiceActive ? 'active' : ''}`} aria-label={voiceActive ? 'Stop listening' : 'Use voice input'} onClick={onVoice}><Mic size={17} /></button><button className="send-button" type="submit" disabled={!input.trim() || busy} aria-label="Send message"><ArrowUp size={18} /></button></div>
        </form>
        <button className={`chat-mode ${status === 'connected' ? 'connected' : ''}`} onClick={onConnect}><span className="mode-dot" />{status === 'connected' ? 'Connected to Xiaozhi AI' : status === 'connecting' ? 'Connecting to Xiaozhi...' : 'Local preview'}<span className="mode-divider" />{status === 'connected' ? 'Connection settings' : 'Connect Xiaozhi'}<ChevronDown size={11} /></button>
      </div>
      <span className="sr-only"><MessageCircle size={1} />Text and voice input are available.</span>
    </aside>
  );
}