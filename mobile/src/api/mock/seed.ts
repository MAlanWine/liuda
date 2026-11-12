import type { DemoTask, GeoPoint, Mood, PlaceArt } from '../types.ts';
import { localMeters, offsetMeters } from '../../domain/geo.ts';
import { grantThread, type Doc, type PostRow } from './db.ts';

/** Simulated other people (UI tag 模拟用户). Their nicknames never leave the mock (public anonymity). */
export const SIM_USERS = [
  { id: 'sim-wanfeng', nickname: '晚风' },
  { id: 'sim-ashu', nickname: '阿树' },
  { id: 'sim-zaoba', nickname: '不想早八' },
  { id: 'sim-taijie', nickname: '台阶观察员' },
  { id: 'sim-mao', nickname: '路过的猫' },
] as const;
export type SimUserId = (typeof SIM_USERS)[number]['id'];
export const isSimUser = (id: string) => id.startsWith('sim-');

/** UIBE demo origin (fictional block, same as legacy `miniprogram/data/demo.js`). */
export const DEFAULT_ORIGIN: GeoPoint = { latitude: 39.9786, longitude: 116.4215 };
export const INTRO_POST_ID = 'seed-bench';

const H = 3_600_000, D = 24 * H;

export type SeedComment = { author: SimUserId | 'caller'; text: string; ago: number };
export type SeedPost = {
  id: string; sceneId: string; name: string; east: number; north: number; author: SimUserId;
  text: string; teaser: string; clue: string; mood: Mood; art: PlaceArt | null; task: DemoTask | null;
  likes: number; ago: number; engagedAgo?: number; comments: SeedComment[]; callerParticipates?: boolean;
};

export const SEED_POSTS: readonly SeedPost[] = [
  { id: 'seed-corner', sceneId: 'scene-corner', name: '风吹得到的角落', east: 0, north: 30, author: 'sim-zaoba',
    text: '今天什么也不想干，就在这里坐了十分钟。风很舒服。你上次在这里，是在等人，还是也在放空？',
    teaser: '今天什么也不想干，就在这里坐了十分钟。', clue: '操场北侧 · 连廊尽头', mood: 'blue', art: 'corner', task: null,
    likes: 8, ago: 3 * D,
    comments: [{ author: 'sim-ashu', text: '风从连廊那头过来，刚好。', ago: 2 * D },
      { author: 'sim-mao', text: '上次在这里等朋友，现在离开了，还是想接着聊。', ago: 1 * D }] },
  { id: 'seed-bench', sceneId: 'scene-bench', name: '第一张长椅', east: 0, north: 80, author: 'sim-wanfeng',
    text: '这里是我每天假装看书，实际发呆的地方。下午三点刚好有树荫。如果你也坐过，接一句吧。',
    teaser: '这里是我每天假装看书，实际发呆的地方。', clue: '图书馆西门 · 梧桐树下', mood: 'sage', art: 'bench', task: null,
    likes: 23, ago: 6 * D, comments: [{ author: 'sim-mao', text: '原来这张椅子还有固定的发呆时间。', ago: 2 * D }] },
  { id: 'seed-stairs', sceneId: 'scene-stairs', name: '拐角的第三级台阶', east: -60, north: 120, author: 'sim-taijie',
    text: '今天在这里摔了一跤，发现还不止我一个。拐角处的台阶有点滑，路过时慢一点。有人知道另一侧有没有无障碍入口吗？',
    teaser: '今天在这里摔了一跤，发现还不止我一个……', clue: '教学楼 · 东侧二层', mood: 'sand', art: 'stairs',
    task: { title: '找到无障碍入口', reward: 5, requirement: '在现场确认入口，拍照并说明路线。当前仅展示任务设计，现金领取后续接入。' },
    likes: 12, ago: 10 * D, comments: [{ author: 'sim-ashu', text: '建议把这级台阶列入体育选修。', ago: 9 * D }] },
  { id: 'seed-stairs-tip', sceneId: 'scene-stairs', name: '拐角的第三级台阶', east: -57, north: 122, author: 'sim-ashu',
    text: '下雨的时候走右边，有扶手。', teaser: '下雨的时候，右边更好走……', clue: '教学楼 · 东侧二层', mood: 'sand', art: 'stairs', task: null,
    likes: 2, ago: 3 * D, comments: [] },
  { id: 'seed-stairs-question', sceneId: 'scene-stairs', name: '拐角的第三级台阶', east: -62, north: 117, author: 'sim-mao',
    text: '这个门周末也开吗？路过的同学接一句。', teaser: '周末从这里进，门开吗？', clue: '教学楼 · 东侧二层', mood: 'sand', art: 'stairs', task: null,
    likes: 0, ago: 2 * H, comments: [] },
  { id: 'seed-quiet', sceneId: 'scene-quiet', name: '路口 · 小树旁', east: 25, north: -45, author: 'sim-wanfeng',
    text: '这里的风刚刚好，发会儿呆。', teaser: '这里适合停一下……', clue: '', mood: 'sage', art: null, task: null,
    likes: 0, ago: 1 * H, comments: [] },
  { id: 'seed-door', sceneId: 'scene-door', name: '教学楼 · 侧门', east: 150, north: 180, author: 'sim-ashu',
    text: '这扇门请拉，别问我怎么知道的。', teaser: '第一次来的人，基本都会……', clue: '', mood: 'blue', art: null, task: null,
    likes: 6, ago: 4 * D, comments: [] },
  { id: 'seed-stand', sceneId: 'scene-stand', name: '操场看台', east: -260, north: -120, author: 'sim-zaoba',
    text: '晚上八点以后，看台最上面一排能看到整片操场的灯。', teaser: '晚上八点以后，看台最上面……', clue: '', mood: 'sand', art: null, task: null,
    likes: 30, ago: 2 * D, comments: [{ author: 'sim-wanfeng', text: '同意，最上面一排风也大。', ago: 1 * D }] },
];

/** Canned lines for simulated people (演示). */
export const SIM_REPLIES = [
  '我刚好路过，这里确实是这样。', '记下了，下次来试试。', '同感，这个角落很适合停一下。',
  '谢谢提醒！', '我也在这里待过一会儿。', '原来不止我一个人注意到。',
];
export const SIM_AUTHOR_REPLIES = ['谢谢你接话，看到了。', '哈哈，你也来过这里。', '下次路过再来看看。'];
export const SIM_CHAT_GREETINGS = ['你好，看到你的留话，想多聊两句。', '我也常去那里，方便聊聊吗？'];
export const SIM_CHAT_REPLIES = ['嗯嗯，我也这么觉得。', '哈哈，是的。', '那里下午人比较少。', '好呀，有空再聊。', '收到。'];

export const hasSeeds = (doc: Doc) => Object.values(doc.posts).some((p) => p.seed);

/** Recomputes counters of a post from its stored comments (used after seeding over imported replies). */
export function recount(doc: Doc, post: PostRow): void {
  const comments = Object.values(doc.comments).filter((c) => c.postId === post.id && c.state === 'active').sort((a, b) => a.createdAt - b.createdAt);
  post.commentCount = comments.length;
  post.replyParticipantIds = [];
  post.lastEngagedAt = post.createdAt;
  for (const c of comments) {
    if (c.ownerId !== post.ownerId && !post.replyParticipantIds.includes(c.ownerId)) {
      post.replyParticipantIds.push(c.ownerId);
      post.lastEngagedAt = Math.max(post.lastEngagedAt, c.createdAt);
    }
  }
  const last = comments[comments.length - 1];
  post.lastCommentAt = last ? last.createdAt : null;
  post.lastCommentOwner = last ? last.ownerId : null;
}

/**
 * Inserts the demo seeds around `anchor` — only into a doc without seeds; existing rows are never replaced.
 * No seed makes `callerId` a participant: participation only comes from the caller's own post or on-site reply
 * (docs/thread-continuation.md). `callerId` is kept for seeds that set `callerParticipates` / `author: 'caller'` (none do).
 */
export function insertSeeds(doc: Doc, anchor: GeoPoint, source: 'fix' | 'simulated', provisional: boolean, callerId: string | null, now: number): void {
  if (hasSeeds(doc)) return;
  doc.anchor = { point: { latitude: anchor.latitude, longitude: anchor.longitude }, source, provisional };
  for (const seed of SEED_POSTS) {
    if (doc.posts[seed.id]) continue;
    const point = offsetMeters(anchor, seed.east, seed.north);
    const createdAt = now - seed.ago;
    const post: PostRow = {
      id: seed.id, ownerId: seed.author, sceneId: seed.sceneId, name: seed.name, text: seed.text, teaser: seed.teaser, clue: seed.clue,
      latitude: point.latitude, longitude: point.longitude, photoId: null, mood: seed.mood, art: seed.art, task: seed.task,
      demo: true, seed: true, state: 'active', createdAt, deletedAt: null, commentCount: 0, likes: seed.likes,
      replyParticipantIds: [], lastEngagedAt: createdAt, lastCommentAt: null, lastCommentOwner: null, importedFrom: null,
    };
    doc.posts[seed.id] = post;
    seed.comments.forEach((c, i) => {
      const ownerId = c.author === 'caller' ? callerId : c.author;
      if (!ownerId) return;
      if (c.author === 'caller' && Object.values(doc.comments).some((x) => x.postId === seed.id && x.ownerId === ownerId)) return;
      const id = seed.id + '-c' + (i + 1);
      doc.comments[id] = { id, postId: seed.id, ownerId, text: c.text, entry: 'onsite', state: 'active', createdAt: now - c.ago, seed: true };
    });
    if (seed.callerParticipates && callerId) grantThread(doc, callerId, seed.id, 'seed', now - seed.ago);
    recount(doc, post);
  }
}

/** 把演示地点移到我附近: translates seed rows only (user posts never move). */
export function reanchorSeeds(doc: Doc, center: GeoPoint, source: 'fix' | 'simulated'): void {
  if (!doc.anchor) return;
  const old = doc.anchor.point;
  for (const post of Object.values(doc.posts)) {
    if (!post.seed) continue;
    const { east, north } = localMeters(post, old);
    const moved = offsetMeters(center, east, north);
    post.latitude = moved.latitude;
    post.longitude = moved.longitude;
  }
  doc.anchor = { point: { latitude: center.latitude, longitude: center.longitude }, source, provisional: false };
}
