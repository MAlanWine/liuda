import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PostSummary } from '../../api';
import { EXPIRED_TEXT } from '../../domain/tiers';
import { formatRelative } from '../../domain/time';
import { Author } from '../Author';
import { DemoBadge } from '../common/DemoBadge';
import { placeArtSource } from '../common/placeArt';
import { colors, moods, ui } from '../ui';
import { PhotoView } from './PhotoView';

/**
 * The post itself, by tier: dot -> 这里有人留过话; preview -> teaser + clue; full -> author, text, clue, photo.
 * Like is enabled only when `likeEnabled` (server `canLike` and on site now). Bounty `task` is display-only (演示).
 */
export function PostPanel({ post, now, likeEnabled, likeBusy, onLike }: {
  post: PostSummary; now: number; likeEnabled: boolean; likeBusy: boolean; onLike: () => void;
}) {
  const [taskOpen, setTaskOpen] = useState(false);
  const palette = moods[post.mood] ?? moods.sage;
  const art = placeArtSource(post.art);
  const expired = post.displayText === EXPIRED_TEXT;
  const time = formatRelative(post.createdAt, now);
  return <>
    <View style={[ui.panel, { backgroundColor: palette.background }]}>
      {art && <Image source={art} style={s.art} resizeMode="cover" accessibilityIgnoresInvertColors accessible={false} />}
      <View style={s.row}>
        {post.level === 'full'
          ? <View style={s.flex}><Author author={post.author} /></View>
          : <Text style={[ui.muted, s.flex, { color: palette.soft }]}>{post.level === 'preview' ? '走近一些 · 预览' : '远处 · 只看得到有人留过话'}</Text>}
        {post.demo && <DemoBadge />}
      </View>
      <Text style={[ui.body, { color: palette.ink }]}>{post.displayText}</Text>
      {post.level === 'preview' && !expired && <Text style={[ui.muted, { color: palette.soft }]}>再走近一点，到场后就能看到全文和接话。</Text>}
      {post.clue && post.level !== 'dot' ? <Text style={[ui.muted, { color: palette.soft }]}>线索 · {post.clue}</Text> : null}
      {post.level === 'full' && post.hasPhoto && <PhotoView key={post.id} post={post} />}
      <View style={s.engagement}>
        <Pressable disabled={!likeEnabled || likeBusy} onPress={onLike} hitSlop={8}
          accessibilityRole="button" accessibilityLabel={post.liked ? '取消点赞' : '点赞'} accessibilityState={{ disabled: !likeEnabled || likeBusy, selected: post.liked }}
          style={({ pressed }) => [s.like, (!likeEnabled || likeBusy) && s.dim, pressed && s.pressed]}>
          <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={19} color={post.liked ? colors.danger : palette.soft} />
          <Text style={{ color: palette.soft }}>{post.likes}</Text>
        </Pressable>
        <Text style={[ui.muted, s.flex, { color: palette.soft }]}>{likeEnabled ? '现场可以点赞' : '点赞需到场'}</Text>
        <Text style={[ui.muted, { color: palette.soft }]}>{[post.distanceLabel, time].filter(Boolean).join(' · ')}</Text>
      </View>
    </View>
    {post.task && <View style={ui.panel}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: taskOpen }} accessibilityLabel={`演示悬赏：${post.task.title}`}
        onPress={() => setTaskOpen(open => !open)} style={s.taskRow}>
        <Text style={[ui.body, s.flex]}>⚑ {post.task.title}</Text>
        <Text style={s.reward}>¥{post.task.reward}</Text>
        <DemoBadge />
        <Ionicons name={taskOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.muted} />
      </Pressable>
      {taskOpen && <Text style={ui.muted}>{post.task.requirement} 仅为演示展示：此版本不支持任务提交、支付或提现。</Text>}
    </View>}
  </>;
}

const s = StyleSheet.create({
  art: { width: '100%', height: 150, borderRadius: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  engagement: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  like: { flexDirection: 'row', gap: 7, alignItems: 'center', minHeight: 44, paddingRight: 8 },
  dim: { opacity: 0.6 },
  pressed: { opacity: 0.72 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  reward: { color: colors.demo, fontSize: 15, fontWeight: '600' },
});
