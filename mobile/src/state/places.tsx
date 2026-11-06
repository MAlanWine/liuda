import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type Reply = { id: string; text: string; mine: boolean };
export type Place = {
  id: string;
  name: string;
  location: string;
  distance: number;
  teaser: string;
  text: string;
  mood: 'sage' | 'sand' | 'blue';
  likes: number;
  liked: boolean;
  participated: boolean;
  owned: boolean;
  replies: Reply[];
  task?: { title: string; reward: number; requirement: string };
};

const initialPlaces: Place[] = [
  {
    id: 'bench', name: '第一张长椅', location: '图书馆西门 · 梧桐树下', distance: 80,
    teaser: '这里是我每天假装看书，实际发呆的地方。',
    text: '这里是我每天假装看书，实际发呆的地方。下午三点刚好有树荫。如果你也坐过，接一句吧。',
    mood: 'sage', likes: 23, liked: false, participated: false, owned: false,
    replies: [{ id: 'bench-1', text: '原来这张椅子还有固定的发呆时间。', mine: false }],
  },
  {
    id: 'stairs', name: '拐角的第三级台阶', location: '教学楼 · 东侧二层', distance: 140,
    teaser: '今天在这里摔了一跤，发现还不止我一个……',
    text: '今天在这里摔了一跤，发现还不止我一个。拐角处的台阶有点滑，路过时慢一点。有人知道另一侧有没有无障碍入口吗？',
    mood: 'sand', likes: 12, liked: false, participated: false, owned: false, replies: [],
    task: { title: '找到无障碍入口', reward: 5, requirement: '在现场确认入口，拍照并说明路线。当前仅展示任务设计，现金领取后续接入。' },
  },
  {
    id: 'corner', name: '风吹得到的角落', location: '操场北侧 · 连廊尽头', distance: 35,
    teaser: '今天什么也不想干，就在这里坐了十分钟。',
    text: '今天什么也不想干，就在这里坐了十分钟。风很舒服。你上次在这里，是在等人，还是也在放空？',
    mood: 'blue', likes: 8, liked: false, participated: true, owned: false,
    replies: [{ id: 'corner-1', text: '上次在这里等朋友。现在离开了，还是想接着聊。', mine: true }],
  },
];

type State = { places: Place[]; arrived: string[]; saved: string[] };
type Store = State & {
  ready: boolean;
  notice: string;
  arrive: (id: string) => void;
  depart: (id: string) => void;
  save: (id: string) => void;
  like: (id: string) => void;
  reply: (id: string, text: string) => void;
  create: (name: string, location: string, text: string) => string;
};
const Context = createContext<Store | null>(null);
const key = 'liuda-mobile-demo-v1';

function validPlace(value: unknown): value is Place {
  if (!value || typeof value !== 'object') return false;
  const place = value as Place;
  return ['id', 'name', 'location', 'teaser', 'text'].every(field => typeof (place as unknown as Record<string, unknown>)[field] === 'string')
    && ['sage', 'sand', 'blue'].includes(place.mood)
    && Number.isFinite(place.distance) && Number.isFinite(place.likes)
    && ['liked', 'participated', 'owned'].every(field => typeof (place as unknown as Record<string, unknown>)[field] === 'boolean')
    && Array.isArray(place.replies) && place.replies.every(reply => typeof reply.id === 'string' && typeof reply.text === 'string' && typeof reply.mine === 'boolean')
    && (!place.task || (typeof place.task.title === 'string' && Number.isFinite(place.task.reward) && typeof place.task.requirement === 'string'));
}

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ places: initialPlaces, arrived: [], saved: [] });
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const writeQueue = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key).then(raw => {
      if (!active || !raw) return;
      const stored = JSON.parse(raw) as State;
      if (!Array.isArray(stored.places) || !stored.places.length || !stored.places.every(validPlace)
        || !Array.isArray(stored.arrived) || !stored.arrived.every(id => typeof id === 'string')
        || !Array.isArray(stored.saved) || !stored.saved.every(id => typeof id === 'string')) throw new Error('invalid demo data');
      setState(stored);
    }).catch(() => {
      if (active) setNotice('本机记录读取失败，当前展示初始演示内容。');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const serialized = JSON.stringify(state);
    writeQueue.current = writeQueue.current.then(() => AsyncStorage.setItem(key, serialized)).catch(() => {
      setNotice('本机保存失败，关闭后这次修改可能丢失。');
    });
  }, [state, ready]);

  function arrive(id: string) {
    setState(current => ({ ...current, arrived: [...new Set([...current.arrived, id])] }));
  }
  function depart(id: string) {
    setState(current => ({ ...current, arrived: current.arrived.filter(value => value !== id) }));
  }
  function save(id: string) {
    setState(current => ({ ...current, saved: current.saved.includes(id) ? current.saved.filter(value => value !== id) : [...current.saved, id] }));
  }
  function like(id: string) {
    setState(current => ({ ...current, places: current.places.map(place => {
      if (place.id !== id || !current.arrived.includes(id)) return place;
      return { ...place, liked: !place.liked, likes: place.likes + (place.liked ? -1 : 1) };
    }) }));
  }
  function reply(id: string, text: string) {
    if (!text.trim()) return;
    setState(current => ({ ...current, places: current.places.map(place => {
      if (place.id !== id || (!place.participated && !current.arrived.includes(id))) return place;
      return { ...place, participated: true, replies: [...place.replies, { id: Date.now() + '-' + Math.random(), text: text.trim(), mine: true }] };
    }) }));
  }
  function create(name: string, location: string, text: string) {
    const id = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const place: Place = { id, name: name.trim(), location: location.trim(), text: text.trim(), teaser: text.trim(), distance: 0, mood: 'sage', likes: 0, liked: false, participated: true, owned: true, replies: [] };
    setState(current => ({ ...current, places: [place, ...current.places], arrived: [...current.arrived, id] }));
    return id;
  }
  return <Context.Provider value={{ ...state, ready, notice, arrive, depart, save, like, reply, create }}>{children}</Context.Provider>;
}

export function usePlaces() {
  const store = useContext(Context);
  if (!store) throw new Error('PlacesProvider is required');
  return store;
}
