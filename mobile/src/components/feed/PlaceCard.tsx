import { useEffect, useState } from 'react';
import { AccessibilityInfo, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PostSummary } from '../../api';
import { heat } from '../../domain/heat';
import { formatRelative } from '../../domain/time';
import type { PositionMode } from '../../state/position';
import { DemoBadge } from '../common/DemoBadge';
import { placeArtSource } from '../common/placeArt';
import { colors, moods } from '../ui';

/** Metres from the post that 模拟走近 / 模拟到场 move the simulated position to (§4). */
export const SIMULATE_NEAR_METRES = 120;
export const SIMULATE_ARRIVE_METRES = 8;

export type CardAction = { label: string; kind: 'open' | 'near' | 'arrive' };

/**
 * Main action for a post. Never fakes arrival in GPS mode: there it only opens the detail page.
 * In 模拟位置 mode a dot offers 模拟走近 (→ preview), a preview 模拟到场 (→ full).
 */
export function primaryAction(post: PostSummary, mode: PositionMode): CardAction {
  if (post.participated) return { label: '继续对话', kind: 'open' };
  if (post.level === 'full') return { label: '查看留话', kind: 'open' };
  if (mode === 'simulated') return post.level === 'preview' ? { label: '模拟到场', kind: 'arrive' } : { label: '模拟走近', kind: 'near' };
  return { label: '看看在哪', kind: 'open' };
}

/** One-line explanation of what the current tier shows (server decides the tier; this only labels it). */
export function tierHint(post: PostSummary): string {
  if (post.participated) return post.level === 'full' ? '已参与这条对话 · 离场也可继续' : '';
  if (post.level === 'dot') return '走到 200 米内，能看到开头';
  if (post.level === 'preview') return '到现场 50 米内，能看到全文';
  return '';
}

/** `距你 120m` when a distance is known, else the server label (已参与 / 可离场继续). */
export function distanceText(post: PostSummary): string {
  return post.distance !== null ? `距你 ${post.distanceLabel}` : post.distanceLabel;
}

/** Small meta chips: time, heat (有回应 / 热门, or 新 for a fresh ordinary post), reply count. */
export function metaParts(post: PostSummary, now: number): string[] {
  const h = heat(post, now);
  const parts = [formatRelative(post.createdAt, now)];
  if (h.tier > 1) parts.push(h.label);
  else if (h.fresh) parts.push('新留话');
  if (post.commentCount > 0) parts.push(`${post.commentCount} 条回应`);
  return parts.filter(Boolean);
}

function useReduceMotion(): boolean | null {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    let changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; setReduceMotion(value); });
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (mounted && !changed) setReduceMotion(value); })
      .catch(() => { if (mounted && !changed) setReduceMotion(false); });
    return () => { mounted = false; listener.remove(); };
  }, []);
  return reduceMotion;
}

const TYPE_LIMIT = 80;

function textMetrics(length: number) {
  if (length <= 36) return { fontSize: 26, lineHeight: 38 };
  if (length <= 90) return { fontSize: 21, lineHeight: 32 };
  return { fontSize: 18, lineHeight: 28 };
}

/**
 * One full-height feed card (D-11: fixed layout, no inner ScrollView). Text = server `displayText` for the tier,
 * clamped to the space left; 展开全文 / tapping the story opens `/place/[id]`.
 */
export function PlaceCard({ post, height, active, now, mode, onOpen, onSimulate, onBookmark, bookmarkBusy }: {
  post: PostSummary; height: number; active: boolean; now: number; mode: PositionMode;
  onOpen: (post: PostSummary) => void; onSimulate: (post: PostSummary, metres: number) => void;
  onBookmark: (post: PostSummary) => void; bookmarkBusy: boolean;
}) {
  const palette = moods[post.mood] ?? moods.sage;
  const art = placeArtSource(post.art);
  const artHeight = Math.min(200, Math.round(height * 0.27));
  const letters = Array.from(post.displayText);
  const metrics = textMetrics(letters.length);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const maxLines = box.height > 0 ? Math.max(2, Math.floor(box.height / metrics.lineHeight)) : 3;
  const perLine = box.width > 0 ? Math.max(4, Math.floor(box.width / metrics.fontSize)) : 12;
  const neededLines = post.displayText.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / perLine)), 0);
  const overflow = box.height > 0 && neededLines > maxLines;

  // Typewriter reveal on the visible card (skipped with reduce motion; long texts finish after TYPE_LIMIT).
  const reduceMotion = useReduceMotion();
  const [reveal, setReveal] = useState({ text: post.displayText, count: 0 });
  if (reveal.text !== post.displayText) setReveal({ text: post.displayText, count: 0 });
  // A card that stops being the visible one mid-reveal shows its whole text (otherwise it stayed cut mid-phrase,
  // e.g. 「…实际发」, with the rest transparent and no ellipsis).
  else if (!active && reveal.count > 0 && reveal.count < letters.length) setReveal({ text: post.displayText, count: letters.length });
  const shown = reduceMotion || reveal.count >= Math.min(TYPE_LIMIT, letters.length) ? letters.length : reveal.count;
  const finished = shown >= letters.length;
  const last = letters[shown - 1];
  const pause = last && /[，。？！]/.test(last) ? 160 : 48;
  useEffect(() => {
    if (!active || finished || reduceMotion !== false) return;
    const timer = setTimeout(() => setReveal(r => ({ ...r, count: r.count + 1 })), pause);
    return () => clearTimeout(timer);
  }, [active, finished, pause, reduceMotion, reveal.count]);

  const action = primaryAction(post, mode);
  const hint = tierHint(post);
  const meta = metaParts(post, now);
  const run = () => {
    if (action.kind === 'near') onSimulate(post, SIMULATE_NEAR_METRES);
    else if (action.kind === 'arrive') onSimulate(post, SIMULATE_ARRIVE_METRES);
    else onOpen(post);
  };
  const fade = `${palette.background}00`;

  return <View style={[s.slot, { height }]}>
    <LinearGradient colors={[palette.background, colors.background]} style={s.card}>
      <Pressable accessibilityRole="button" accessibilityHint="打开这条留话"
        accessibilityLabel={`${post.name}，${distanceText(post)}，${meta.join('，')}。${post.displayText}`}
        onPress={() => onOpen(post)} style={({ pressed }) => [s.main, pressed && s.pressed]}>
        {art && <View style={[s.artFrame, { height: artHeight, backgroundColor: palette.background }]}>
          <Image source={art} style={s.art} resizeMode="cover" accessible={false} />
          <LinearGradient pointerEvents="none" colors={[fade, fade, `${palette.background}99`, palette.background]}
            locations={[0, 0.43, 0.77, 1]} style={StyleSheet.absoluteFill} />
        </View>}
        <View style={s.content}>
          <View style={s.metaRow}>
            <Text numberOfLines={1} style={[s.placeName, { color: palette.soft }]}>{post.name}</Text>
            <Text numberOfLines={1} style={[s.small, { color: palette.soft }]}>{distanceText(post)}</Text>
          </View>
          <View style={s.chips}>
            {meta.map(part => <Text key={part} style={[s.chip, { color: palette.soft }]}>{part}</Text>)}
            {post.demo && <DemoBadge />}
          </View>
          <View style={s.story} onLayout={e => {
            const { width, height: h } = e.nativeEvent.layout;
            if (width !== box.width || h !== box.height) setBox({ width, height: h });
          }}>
            {box.height > 0 && <Text numberOfLines={maxLines} ellipsizeMode="tail"
              style={[s.storyText, metrics, { color: post.level === 'dot' ? palette.soft : palette.ink }]}>
              {letters.slice(0, shown).join('')}
              <Text style={s.unrevealed}>{letters.slice(shown).join('')}</Text>
            </Text>}
          </View>
          <View style={s.hintRow}>
            {hint ? <Text numberOfLines={1} style={[s.small, s.hint, { color: palette.soft }]}>{hint}</Text> : <View style={s.hint} />}
            {overflow && post.level !== 'dot' && <Text style={[s.small, s.more, { color: palette.ink }]}>展开全文</Text>}
          </View>
        </View>
      </Pressable>
      <View style={[s.bottom, { borderTopColor: `${palette.soft}33` }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={run}
          style={({ pressed }) => [s.open, pressed && s.pressed]}>
          <Text style={[s.openText, { color: palette.ink }]}>{action.label}</Text>
          <Ionicons name={action.kind === 'open' ? 'arrow-forward' : 'walk-outline'} size={17} color={palette.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={post.saved ? '取消想去' : '标记想去'}
          accessibilityState={{ selected: post.saved, busy: bookmarkBusy }} disabled={bookmarkBusy}
          onPress={() => onBookmark(post)} style={({ pressed }) => [s.save, (pressed || bookmarkBusy) && s.pressed]}>
          <Ionicons name={post.saved ? 'bookmark' : 'bookmark-outline'} size={20} color={palette.soft} />
        </Pressable>
      </View>
    </LinearGradient>
  </View>;
}
const s = StyleSheet.create({
  slot: { paddingHorizontal: 16, paddingVertical: 10 },
  card: { flex: 1, borderRadius: 28, overflow: 'hidden' },
  main: { flex: 1 },
  artFrame: { overflow: 'hidden' },
  art: { width: '100%', height: '100%' },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 18, gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  placeName: { flex: 1, fontSize: 13, lineHeight: 20 },
  small: { fontSize: 11, lineHeight: 16 },
  chips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, minHeight: 20 },
  chip: { fontSize: 11, lineHeight: 16, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.tag, overflow: 'hidden' },
  story: { flex: 1, justifyContent: 'center', paddingVertical: 8 },
  storyText: { fontWeight: '600' },
  unrevealed: { color: 'transparent' },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24, paddingBottom: 6 },
  hint: { flex: 1 },
  more: { fontWeight: '600' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: 24, paddingTop: 6, paddingBottom: 12 },
  open: { minHeight: 44, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  openText: { fontWeight: '600', fontSize: 14 },
  save: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-end' },
  pressed: { opacity: 0.65 },
});
