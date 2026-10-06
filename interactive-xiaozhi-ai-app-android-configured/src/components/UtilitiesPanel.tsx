import { useMemo, useState, type FormEvent } from 'react';
import { Bell, CloudSun, MapPin, Navigation, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { DailyReminder, WeatherReport } from '../types';

export default function UtilitiesPanel({
  weatherLocation,
  onWeatherLocation,
  weather,
  weatherLoading,
  onWeather,
  onNavigate,
  reminders,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
}: {
  weatherLocation: string;
  onWeatherLocation: (value: string) => void;
  weather: WeatherReport | null;
  weatherLoading: boolean;
  onWeather: () => void;
  onNavigate: (destination: string) => Promise<void>;
  reminders: DailyReminder[];
  onAddReminder: (title: string, time: string) => Promise<void>;
  onToggleReminder: (id: number) => Promise<void>;
  onDeleteReminder: (id: number) => Promise<void>;
}) {
  const [destination, setDestination] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderTime, setReminderTime] = useState('08:00');
  const nextReminder = useMemo(() => reminders.filter((item) => item.enabled).sort((a, b) => a.time.localeCompare(b.time))[0], [reminders]);

  async function submitNavigation(event: FormEvent) {
    event.preventDefault();
    if (!destination.trim()) return;
    await onNavigate(destination.trim());
  }

  async function submitReminder(event: FormEvent) {
    event.preventDefault();
    if (!reminderTitle.trim()) return;
    await onAddReminder(reminderTitle.trim(), reminderTime);
    setReminderTitle('');
  }

  return <>
    <p className="panel-description">Useful little things Lumi can help with every day — by touch or by voice.</p>
    <div className="utility-grid">
      <section className="utility-card weather-card">
        <div className="utility-card-heading"><span><CloudSun size={19} /></span><div><p className="eyebrow">WEATHER</p><h3>What is it like outside?</h3></div></div>
        <div className="utility-inline-form"><input className="text-field" value={weatherLocation} onChange={(event) => onWeatherLocation(event.target.value)} placeholder="Singapore, London, Tokyo..." maxLength={120} /><button type="button" className="utility-action-button" onClick={onWeather} disabled={weatherLoading}>{weatherLoading ? <RefreshCw size={16} className="utility-spin" /> : <CloudSun size={16} />}<span>{weather ? 'Refresh' : 'Check'}</span></button></div>
        {weather ? <div className="weather-result"><div><strong>{Math.round(weather.temperature)}°</strong><span>{weather.condition}</span></div><p>{weather.location}{weather.country ? `, ${weather.country}` : ''}</p><div className="weather-stats"><span>Feels {Math.round(weather.apparentTemperature)}°</span><span>H {Math.round(weather.high)}° / L {Math.round(weather.low)}°</span><span>Rain {Math.round(weather.precipitationChance)}%</span><span>Humidity {Math.round(weather.humidity)}%</span></div></div> : <p className="utility-hint">No API key needed. Lumi looks up a place and gives you the current conditions plus today’s range.</p>}
      </section>

      <section className="utility-card navigation-card">
        <div className="utility-card-heading"><span><MapPin size={19} /></span><div><p className="eyebrow">NAVIGATION</p><h3>Take me somewhere.</h3></div></div>
        <form onSubmit={submitNavigation} className="utility-stack-form"><input className="text-field" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Where do you want to go?" maxLength={160} /><button className="primary-button utility-wide-button" type="submit" disabled={!destination.trim()}><Navigation size={16} />Start navigation</button></form>
        <p className="utility-hint">On Android Lumi hands the destination to your map app. On desktop/web it opens Google Maps directions.</p>
      </section>

      <section className="utility-card reminders-card">
        <div className="utility-card-heading"><span><Bell size={19} /></span><div><p className="eyebrow">DAILY REMINDERS</p><h3>Little nudges, right on time.</h3></div></div>
        <form onSubmit={submitReminder} className="reminder-create"><input className="text-field" value={reminderTitle} onChange={(event) => setReminderTitle(event.target.value)} placeholder="Drink water, take medication, stretch..." maxLength={100} /><input className="text-field reminder-time" type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} /><button className="utility-icon-button" type="submit" aria-label="Add daily reminder" disabled={!reminderTitle.trim()}><Plus size={17} /></button></form>
        {nextReminder && <p className="next-reminder"><Bell size={13} />Next daily reminder: <strong>{nextReminder.title}</strong> at {nextReminder.time}</p>}
        <div className="reminder-list">{reminders.length ? reminders.map((reminder) => <div className={`reminder-row ${reminder.enabled ? '' : 'disabled'}`} key={reminder.id}><button className={`reminder-toggle-dot ${reminder.enabled ? 'on' : ''}`} onClick={() => void onToggleReminder(reminder.id)} aria-label={`${reminder.enabled ? 'Disable' : 'Enable'} ${reminder.title}`} title={reminder.enabled ? 'Disable reminder' : 'Enable reminder'}><span /></button><div><strong>{reminder.title}</strong><span>Every day at {reminder.time}</span></div><button className="utility-delete" onClick={() => void onDeleteReminder(reminder.id)} aria-label={`Delete ${reminder.title}`}><Trash2 size={15} /></button></div>) : <p className="utility-empty">No daily reminders yet.</p>}</div>
      </section>
    </div>
    <div className="utility-voice-tip"><span>Try saying</span><p>“Lumi, what’s the weather in Seoul?” · “Navigate me to Changi Airport.” · “Remind me every day at 9 PM to stretch.”</p></div>
  </>;
}
