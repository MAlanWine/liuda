import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { describeError, type PostSummary } from '../../api';
import { NEARBY_RADIUS, PREVIEW_RADIUS } from '../../domain/gate';
import { permissionMessage } from '../../location/permission';
import { useNearby } from '../../state/nearby';
import { usePosition, useTrackWhileFocused } from '../../state/position';
import { useProfile } from '../../state/profile';
import { Notice } from '../../components/common/Notice';
import { PermissionHelp } from '../../components/common/PermissionHelp';
import { DiscoverHeader } from '../../components/feed/DiscoverHeader';
import { FeedList } from '../../components/feed/FeedList';
import DiscoverMap from '../../components/map/DiscoverMap';
import { Action, colors, Loading, Screen, ui } from '../../components/ui';

type Message = { text: string; tone: 'info' | 'error' };

export default function DiscoverScreen() {
  useTrackWhileFocused();
  const nearby = useNearby();
  const { mode, fix, permission, notice: positionNotice, simulateNear } = usePosition();
  const { ready: profileReady } = useProfile();
  const focused = useIsFocused();
  const [message, setMessage] = useState<Message | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [reanchoring, setReanchoring] = useState(false);
  const { toggleBookmark, reanchorHere, refresh } = nearby;

  const open = useCallback((post: PostSummary) => {
    router.push({ pathname: '/place/[id]', params: { id: post.id } });
  }, []);
  // 模拟走近 / 模拟到场 only exist in 模拟位置 mode (PlaceCard never offers them in GPS mode).
  const simulate = useCallback((post: PostSummary, metres: number) => {
    setMessage(null);
    simulateNear({ latitude: post.latitude, longitude: post.longitude }, metres);
  }, [simulateNear]);
  const bookmark = useCallback(async (post: PostSummary) => {
    setBusyIds(ids => ids.includes(post.id) ? ids : [...ids, post.id]);
    try {
      await toggleBookmark(post.id, !post.saved);
    } catch (e) {
      setMessage({ text: describeError(e), tone: 'error' });
    } finally {
      setBusyIds(ids => ids.filter(id => id !== post.id));
    }
  }, [toggleBookmark]);
  const reanchor = async () => {
    if (reanchoring) return;
    setReanchoring(true);
    try {
      await reanchorHere();
      setMessage({ text: '演示地点已移到你附近。', tone: 'info' });
    } catch (e) {
      setMessage({ text: describeError(e), tone: 'error' });
    } finally {
      setReanchoring(false);
    }
  };

  if (!profileReady) return <Loading />;

  const gps = mode === 'gps';
  const needsHelp = gps && permission !== 'granted';
  const noFix = !fix;
  const empty = nearby.ready && !nearby.error && nearby.posts.length === 0;
  const allFar = nearby.posts.length > 0 && nearby.posts.every(p => !p.participated && p.distance !== null && p.distance > PREVIEW_RADIUS);
  const reanchorLabel = reanchoring ? '正在移动演示地点…' : '把演示地点移到我附近';

  let body;
  if (noFix && gps) {
    body = <View style={s.state}>
      {needsHelp ? <PermissionHelp /> : <View style={s.center}><ActivityIndicator color={colors.accent} /><Text style={ui.muted}>{positionNotice || '正在定位…'}</Text></View>}
    </View>;
  } else if (!nearby.ready) {
    body = <View style={s.center}><ActivityIndicator color={colors.accent} /><Text style={ui.muted}>正在寻找附近的留话</Text></View>;
  } else if (empty && nearby.view === 'cards') {
    body = <View style={s.state}>
      <View style={ui.panel}>
        <Text style={s.title}>附近 {NEARBY_RADIUS} 米内还没有留话</Text>
        <Text style={ui.muted}>可以在这里留下第一句。{fix ? '想先体验，也可以把演示地点移到你身边。' : ''}</Text>
        <Action title="在这里留话" onPress={() => router.push('/leave')} />
        {fix && <Action secondary disabled={reanchoring} title={reanchorLabel} onPress={reanchor} />}
      </View>
    </View>;
  } else if (nearby.view === 'map') {
    body = <DiscoverMap posts={nearby.posts} fix={fix} mode={mode} sort={nearby.sort} onSortChange={nearby.setSort} onOpen={open} onSimulate={simulate} />;
  } else {
    body = <FeedList posts={nearby.posts} focused={focused} mode={mode} onOpen={open} onSimulate={simulate}
      onBookmark={bookmark} busyIds={busyIds} onRefresh={refresh} />;
  }

  const showFarHint = nearby.ready && fix !== null && (allFar || (empty && nearby.view === 'map'));
  return <Screen>
    <DiscoverHeader view={nearby.view} onViewChange={nearby.setView} sort={nearby.sort} onSortChange={nearby.setSort} />
    <View style={s.notices}>
      {needsHelp && !noFix && <PermissionHelp />}
      {/* PermissionHelp already says it for approximate location; show the global notice only when it adds something. */}
      {gps && !noFix && positionNotice && !(needsHelp && positionNotice === permissionMessage(permission)) ? <Notice message={positionNotice} /> : null}
      {nearby.error && <Notice tone="error" message={describeError(nearby.error)} actionLabel="重试" onAction={() => { refresh(); }} />}
      {message && <Notice tone={message.tone} message={message.text} actionLabel="知道了" onAction={() => setMessage(null)} />}
      {showFarHint && <Notice message={empty ? `附近 ${NEARBY_RADIUS} 米内还没有留话。` : `附近的留话都在 ${PREVIEW_RADIUS} 米外。`}
        actionLabel={reanchorLabel} onAction={reanchor} />}
      {nearby.limited && !nearby.error && <Notice message="附近留话较多，仅显示最近 50 条。" />}
    </View>
    <View style={s.body}>{body}</View>
  </Screen>;
}
const s = StyleSheet.create({
  notices: { paddingHorizontal: 20, gap: 6 },
  body: { flex: 1 },
  state: { flex: 1, padding: 20, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
