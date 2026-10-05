import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultHome, readStored } from '../data';
import type { Activity, HomeSettings } from '../types';

const durations: Partial<Record<Activity, number>> = { water: 12000, read: 18000, tea: 14000, rest: 22000, wander: 11000 };

export function useLivingWorld(paused: boolean) {
  const [home, setHome] = useState<HomeSettings>(() => ({ ...defaultHome, ...readStored<Partial<HomeSettings>>('mori-home', {}) }));
  const [activity, setActivity] = useState<Activity>('idle');
  const [activityId, setActivityId] = useState(0);
  const [destination, setDestination] = useState(0);
  const endTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const growthTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const routine = useRef(0);
  const wanderDirection = useRef(0);

  const doActivity = useCallback((next: Activity, destination?: number) => {
    clearTimeout(endTimer.current);
    clearTimeout(growthTimer.current);
    setActivity(next);
    setActivityId((previous) => previous + 1);
    setDestination(next === 'water' ? -0.64 : next === 'computer' ? 0.64 : next === 'rest' || next === 'read' ? -0.52 : next === 'wander' ? destination ?? (wanderDirection.current++ % 2 ? -0.75 : 0.7) : 0);
    if (next === 'water') growthTimer.current = setTimeout(() => setHome((previous) => ({ ...previous, plantGrowth: Math.min(5, previous.plantGrowth + 1) })), 8500);
    if (durations[next]) endTimer.current = setTimeout(() => { setActivity('idle'); setDestination(0); }, durations[next]);
  }, []);

  useEffect(() => {
    if (paused || !home.autonomous || activity !== 'idle') return;
    const timer = setTimeout(() => {
      const activities: Activity[] = ['wander', 'water', 'tea', 'read', 'rest'];
      doActivity(activities[routine.current++ % activities.length]);
    }, 30000);
    return () => clearTimeout(timer);
  }, [paused, home.autonomous, activity, activityId, doActivity]);

  useEffect(() => {
    try { localStorage.setItem('mori-home', JSON.stringify(home)); } catch { /* Storage can be unavailable in private mode. */ }
  }, [home]);

  useEffect(() => () => { clearTimeout(endTimer.current); clearTimeout(growthTimer.current); }, []);

  return { home, setHome, activity, activityId, destination, doActivity };
}