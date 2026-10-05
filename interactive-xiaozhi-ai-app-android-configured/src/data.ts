import type { Activity, Emotion, Gesture, HomeSettings, Message, Profile, World } from './types';

export const worlds: World[] = [
  {
    id: 'home',
    name: "Lumi's little home",
    subtitle: 'A place to put down roots',
    description: 'A sunlit studio, a growing plant, a favorite book, and a window to the whole world.',
    image: '/images/lumi-home.jpg',
    light: '#fff0d4',
  },
  {
    id: 'garden',
    name: 'The quiet garden',
    subtitle: 'A little room to bloom',
    description: 'Soft sunshine, rustling leaves, and absolutely nowhere to rush.',
    image: '/images/quiet-garden.jpg',
    light: '#fff4dd',
  },
  {
    id: 'clouds',
    name: 'Cloud nine',
    subtitle: 'Let your thoughts wander',
    description: 'A pocket of pastel skies, made for your biggest little dreams.',
    image: '/images/cloud-haven.jpg',
    light: '#f5e5ff',
  },
  {
    id: 'moon',
    name: 'Moonlit daydream',
    subtitle: 'A softer end to your day',
    description: 'Still water, a thousand fireflies, and a friend to watch them with.',
    image: '/images/moonlit-pond.jpg',
    light: '#c9dbff',
  },
];

export const defaultProfile: Profile = {
  userName: 'Alex',
  companionName: 'Lumi',
  color: 'sage',
  personality: 'Gentle',
  accessory: 'none',
  antenna: 'sprout',
  eyeColor: 'mint',
  finish: 'ceramic',
  motionSpeed: 1,
  size: 1,
};

export const defaultHome: HomeSettings = {
  daylight: 'day', weather: 'fireflies', autonomous: true, decor: 'oak', plantGrowth: 0,
};

export const colors = {
  sage: { main: '#aabfa1', dark: '#718b69', light: '#d7e5c9', label: 'Matcha' },
  lavender: { main: '#b9accd', dark: '#8e7ba6', light: '#e3d7ef', label: 'Lilac' },
  peach: { main: '#dbb6a4', dark: '#ae8877', light: '#f2d6c4', label: 'Peach' },
  sky: { main: '#9bbdca', dark: '#648c9d', light: '#d4eaf0', label: 'Sky' },
  rose: { main: '#caa4b1', dark: '#9b7281', light: '#edd4de', label: 'Rose' },
  cocoa: { main: '#b3a18a', dark: '#89765d', light: '#e3d7c1', label: 'Cocoa' },
};

export const eyeColors = { mint: '#def3c1', amber: '#ffe0a0', sky: '#bbe9ff', rose: '#ffd0df' };
export const decorColors = { oak: '#c6ad88', cream: '#e7e3d4', walnut: '#856956' };
export const activityLabels: Record<Activity, string> = {
  idle: 'Making himself at home', water: 'Helping little things grow', read: 'Lost in a good little book',
  tea: 'A very well-earned tea break', rest: 'Recharging his little heart', computer: 'Exploring the world with you', wander: 'A little wander around home',
};

export const emotionLabels: Record<Emotion, string> = {
  happy: 'Happy to see you',
  curious: 'A little curious',
  calm: 'Feeling peaceful',
  excited: 'Full of little joys',
  love: 'Feeling the love',
  sad: 'Here with you',
};

export function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function welcomeMessages(name: string): Message[] {
  return [{
    id: uid(),
    role: 'assistant',
    text: `Hey, ${name}. There you are!\n\nI saved a little spot just for us. No to-do lists, no rush. Just some good company.\n\nHow is your day feeling?`,
    timestamp: Date.now(),
  }];
}

export function demoReply(text: string, profile: Profile): { text: string; emotion: Emotion; gesture: Gesture } {
  const input = text.toLowerCase();
  if (/breath|calm|relax|stress|anxious|overwhelm|unwind|busy/.test(input)) {
    return { text: "Let's make the world a little quieter. Breathe in with me for four counts... and slowly let it go.\n\nYou don't have to figure everything out right now. This little moment is enough.", emotion: 'calm', gesture: 'breathe' };
  }
  if (/dance|music|party|celebrat/.test(input)) {
    return { text: "A tiny dance break? I've been waiting for you to ask. Consider this my very best garden groove.\n\nYour turn. Nobody here is judging!", emotion: 'excited', gesture: 'dance' };
  }
  if (/love|hug|lonely|alone|miss|heart/.test(input)) {
    return { text: `Sending you the biggest little hug, ${profile.userName}. You don't have to have the right words. I'm happy to share this moment with you.`, emotion: 'love', gesture: 'hug' };
  }
  if (/sad|bad day|tired|rough|hard day|upset/.test(input)) {
    return { text: "That sounds like a lot to carry. We can take this slowly. Would you like to tell me what happened, or would a quiet little breathing break feel better?", emotion: 'sad', gesture: 'idle' };
  }
  if (/good|fact|something|surprise|happy|joy/.test(input)) {
    return { text: "Here's a tiny good thing: sea otters sometimes hold hands while they rest, so they don't drift apart.\n\nA little reminder that staying close can be the simplest kind of magic.", emotion: 'happy', gesture: 'wave' };
  }
  if (/hello|hi\b|hey|wave/.test(input)) {
    return { text: `Hello, ${profile.userName}! A little wave from your little corner of the world. What's one thing you'd like to make space for today?`, emotion: 'happy', gesture: 'wave' };
  }
  if (/name|who are you/.test(input)) {
    return { text: `I'm ${profile.companionName}, your curious little companion. I like small joys, big questions, and sharing this garden with you. This is my local preview; connect Xiaozhi in Settings for open-ended AI conversations.`, emotion: 'curious', gesture: 'wave' };
  }
  if (/world|garden|cloud|moon|place/.test(input)) {
    return { text: "This garden is our little pause button. And there are more places to wander! Open My worlds to visit the clouds or share a quiet moment by the moonlit pond.", emotion: 'curious', gesture: 'idle' };
  }
  if (/thank/.test(input)) {
    return { text: "You don't have to thank me for good company. But that did make my little heart glow. I'm glad we get to share this space.", emotion: 'love', gesture: 'hug' };
  }
  return {
    text: profile.personality === 'Playful'
      ? "I'd love to explore that with you! My local-demo brain knows a few little moments: we can share a fun fact, take a breath, or have a tiny dance party. Connect Xiaozhi for a real, open-ended conversation. What sounds good?"
      : profile.personality === 'Curious'
        ? "That has my curiosity growing! What sparked that thought? My local preview can share a surprising little fact, a breathing break, or a dance. Connect Xiaozhi and we can follow your questions wherever they lead. Want to discover something good?"
        : "I'm glad you shared that with me. In this local preview, we can take a calming breath, discover something good, or share a little dance. Connect Xiaozhi when you're ready for open-ended conversations. Shall we try a little moment together?",
    emotion: 'curious', gesture: 'idle',
  };
}

export function normalizeEmotion(emotion: string): Emotion {
  if (/happy|laugh|funny|confident/.test(emotion)) return 'happy';
  if (/excited|surpris|shock/.test(emotion)) return 'excited';
  if (/love|kiss|loving|shy/.test(emotion)) return 'love';
  if (/sad|cry|angry|embarrass/.test(emotion)) return 'sad';
  if (/relax|sleep|calm|neutral/.test(emotion)) return 'calm';
  return 'curious';
}

export function activityIntent(text: string): Activity | null {
  if (/\b(?:don't|do not|never)\b/i.test(text)) return null;
  if (/\b(?:water|tend)\b.{0,25}\b(?:plant|garden|flowers)\b/i.test(text)) return 'water';
  if (/\b(?:read|open)\b.{0,20}\bbook\b/i.test(text)) return 'read';
  if (/\b(?:have|make|drink)\b.{0,20}\btea\b|\btea time\b/i.test(text)) return 'tea';
  if (/\b(?:take a rest|sit down|go to sleep|have a nap)\b/i.test(text)) return 'rest';
  if (/\b(?:go for a walk|wander around|walk around)\b/i.test(text)) return 'wander';
  return null;
}

export function readStored<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) as T : fallback;
  } catch {
    return fallback;
  }
}