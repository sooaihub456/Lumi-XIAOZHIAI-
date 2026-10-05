import { Armchair, BookOpen, Coffee, Droplets, Monitor, SlidersHorizontal } from 'lucide-react';
import type { Activity } from '../types';

const activities: { id: Activity; label: string; icon: typeof Coffee }[] = [
  { id: 'water', label: 'Tend the garden', icon: Droplets },
  { id: 'read', label: 'A little reading', icon: BookOpen },
  { id: 'tea', label: 'Tea time', icon: Coffee },
  { id: 'rest', label: 'Take a rest', icon: Armchair },
];

export default function WorldDock({ activity, onActivity, onComputer, onCustomize }: { activity: Activity; onActivity: (activity: Activity) => void; onComputer: () => void; onCustomize: () => void }) {
  return <div className="world-dock"><div className="world-dock-heading"><span>A LITTLE LIFE OF HIS OWN</span><button onClick={onCustomize} aria-label="Personalize the room" title="Make this space yours"><SlidersHorizontal size={13} /><span>Make it yours</span></button></div><div className="world-dock-actions">{activities.map(({ id, label, icon: Icon }) => <button key={id} className={activity === id ? 'active' : ''} onClick={() => onActivity(activity === id ? 'idle' : id)} aria-pressed={activity === id}><Icon size={18} strokeWidth={1.4} /><span>{label}</span></button>)}<button className={`computer-dock-button ${activity === 'computer' ? 'active' : ''}`} onClick={onComputer}><Monitor size={19} strokeWidth={1.5} /><span>His computer</span><span className="computer-dock-dot" /></button></div></div>;
}