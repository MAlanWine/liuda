import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import Ionicons from '@expo/vector-icons/Ionicons';
import { describeError, type ChatMeta, type Comment, type ReportTarget } from '../../api';
import { emptyAttempt, type Attempt } from '../../domain/attempt';
import { chatEntry } from '../../domain/chat';
import { placeWantsTracking } from '../../domain/refresh';
import { EXPIRED_TEXT } from '../../domain/tiers';
import { deletePost, setLike } from '../../state/actions';
import { useInbox } from '../../state/inbox';
import { useNearby } from '../../state/nearby';
import { useNow } from '../../state/now';
import { usePosition, useSignificantFix, useTrackWhileFocused } from '../../state/position';
import { useThread } from '../../state/thread';
import { LivePlacePosition } from '../../components/LivePlacePosition';
import { ErrorView } from '../../components/common/ErrorView';
import { Notice } from '../../components/common/Notice';
import { PermissionHelp } from '../../components/common/PermissionHelp';
import { PositionModeChip } from '../../components/common/PositionModeChip';
import { ReportSheet } from '../../components/common/ReportSheet';
import { ChatRequestSheet } from '../../components/thread/ChatRequestSheet';
import { CommentList } from '../../components/thread/CommentList';
import { Composer } from '../../components/thread/Composer';
import { PostPanel } from '../../components/thread/PostPanel';
import { ThreadMenu } from '../../components/thread/ThreadMenu';
import { Action, colors, ui } from '../../components/ui';

/** Back to where the user came from without stacking another discover (D-8). */
function leave() {
  if (router.canGoBack()) router.back();
  else router.dismissTo('/discover');
}

/** 回到发现 means the feed itself, even when this place was opened from 已留下 / 消息 (dismissTo pops to the tabs, D-8). */
function goDiscover() {
  router.dismissTo('/discover');
}

export default function PlaceScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const postId = typeof params.id === 'string' ? params.id : '';
  const headerHeight = useHeaderHeight();
  const now = useNow();
  const { thread, loading, error, refresh } = useThread(postId);
  const position = usePosition();
  const { toggleBookmark, posts: nearbyPosts } = useNearby();
  // My open chat request on this post (pending / active) comes from the inbox; refreshed whenever this screen is focused.
  const { inbox, refresh: refreshInbox } = useInbox();
  useFocusEffect(useCallback(() => { refreshInbox(); }, [refreshInbox]));
  const [updateRequested, setUpdateRequested] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [pulling, setPulling] = useState(false);
  // Reply draft lives here, above the tier branch: a brief collapse (expiry, blur) never wipes what the user typed.
  const [replyDraft, setReplyDraft] = useState<Attempt>(emptyAttempt);

  const post = thread?.post ?? null;
  const participant = post?.participated === true;
  // Participants never start GPS unless they ask (我在现场，更新位置); others track while this screen is focused —
  // from the first frame, not only after the thread loaded (the fix used to go stale in that gap).
  const knownParticipant = !!inbox?.threads.some(t => t.id === postId) || nearbyPosts.some(p => p.id === postId && p.participated);
  const wantsTracking = placeWantsTracking({ updateRequested, participated: post ? participant : null, knownParticipant, errorCode: error?.code });
  useTrackWhileFocused(wantsTracking);

  // useThread refetches non-participants on movement; participants only after they asked or moved in 模拟位置.
  const moved = useSignificantFix(10);
  const lastMoved = useRef(moved);
  useEffect(() => {
    if (moved === lastMoved.current) return;
    lastMoved.current = moved;
    if (participant && (updateRequested || position.mode === 'simulated')) refresh();
  }, [moved, participant, updateRequested, position.mode, refresh]);

  const requestUpdate = useCallback(async () => {
    setUpdateRequested(true);
    const next = await position.refresh();
    if (next) await refresh();
  }, [position, refresh]);

  if (!post) {
    if (error?.code === 'POST_MISSING') {
      return <View style={ui.screen}><ErrorView title="这条留话已不可用" message="它可能已被作者删除，或已对你隐藏。" onRetry={goDiscover} retryLabel="回到发现" /></View>;
    }
    if (error) {
      const needsPosition = ['LOCATION_REQUIRED', 'STALE_LOCATION', 'WEAK_LOCATION', 'INVALID_LOCATION'].includes(error.code);
      return <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
        <View style={s.row}><Text style={[ui.title, s.flex]}>{needsPosition ? '需要确认位置' : '暂时打不开'}</Text><PositionModeChip /></View>
        <Notice tone="error" message={describeError(error)} />
        <Notice message={position.notice} />
        {needsPosition && <PermissionHelp showSimulated />}
        <Action title={loading ? '正在打开…' : '重试'} disabled={loading} onPress={() => { refresh(); }} />
        <Action secondary title="回到发现" onPress={goDiscover} />
      </ScrollView>;
    }
    return <View style={[ui.screen, ui.center]}><Text style={ui.muted}>正在打开这条留话…</Text></View>;
  }

  const onsite = post.canInteract && position.fresh && !!position.fix;
  const full = post.level === 'full';
  const expired = post.displayText === EXPIRED_TEXT;
  const likeEnabled = post.canLike && onsite;
  const chat = chatEntry(inbox?.chats, post.id);
  const canRequestChat = full && onsite && !post.owned && chat.kind === 'request';

  async function like() {
    if (!post || !position.fix) return;
    setLikeBusy(true);
    setNotice('');
    try { await setLike(post, !post.liked, position.fix); }
    catch (e) { setNotice(describeError(e)); }
    finally { setLikeBusy(false); }
  }

  async function bookmark() {
    if (!post) return;
    setNotice('');
    try { await toggleBookmark(post.id, !post.saved); }
    catch (e) { setNotice(describeError(e)); }
  }

  function confirmDelete() {
    Alert.alert('删除这条留话？', '删除后所有人都无法再查看和接话，私聊申请也会失效。此操作无法撤销。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        try { await deletePost(postId); leave(); }
        catch (e) { setNotice(describeError(e)); }
      } },
    ]);
  }

  function reportDone(result: { kind: 'report'; hidden: boolean } | { kind: 'block' }) {
    const target = reportTarget;
    if (result.kind === 'block' || target?.kind === 'post') {
      // Let the sheet's modal finish closing before presenting the alert (iOS presents one at a time).
      setTimeout(() => Alert.alert(result.kind === 'block' ? '已屏蔽' : '已举报',
        result.kind === 'block' ? '不会再看到对方的留话、接话和私聊。' : '这条留话已对你隐藏。', [{ text: '好', onPress: leave }]), 400);
    } else {
      setNotice('已举报，这条接话已对你隐藏。');
    }
  }

  function openChat(chatId: string) {
    router.push({ pathname: '/chat/[id]', params: { id: chatId } });
  }

  function chatSent(sent: ChatMeta) {
    setChatOpen(false);
    openChat(sent.id);
  }

  const reportComment = (comment: Comment) => setReportTarget({ kind: 'comment', postId: post.id, commentId: comment.id });

  return <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => { setPulling(true); refresh().finally(() => setPulling(false)); }} tintColor={colors.accent} />}>
      <View style={s.row}>
        <Text accessibilityRole="header" style={[ui.title, s.flex]}>{post.name}</Text>
        <Pressable onPress={bookmark} accessibilityRole="button" accessibilityLabel={post.saved ? '取消想去' : '加入想去'} accessibilityState={{ selected: post.saved }} hitSlop={10} style={s.icon}>
          <Ionicons name={post.saved ? 'bookmark' : 'bookmark-outline'} size={23} color={colors.accent} />
        </Pressable>
        <ThreadMenu post={post} canRequestChat={canRequestChat} chat={chat} onRequestChat={() => setChatOpen(true)} onOpenChat={openChat}
          onReport={() => setReportTarget({ kind: 'post', postId: post.id })} onDelete={confirmDelete} />
      </View>
      <LivePlacePosition post={post} onsite={onsite} tracking={wantsTracking} onRequestUpdate={requestUpdate} />
      <PostPanel post={post} now={now} likeEnabled={likeEnabled} likeBusy={likeBusy} onLike={like} />
      {expired && <Notice message="对话信息已过期。" actionLabel={loading ? '正在刷新…' : '刷新'} onAction={() => { refresh(); }} />}
      <Notice tone="error" message={notice} />
      {full && <>
        <CommentList comments={thread?.comments ?? []} total={post.commentCount} now={now} onReport={reportComment} />
        {post.canReply && (onsite || participant)
          ? <Composer key={post.id} post={post} onsite={onsite} fix={position.fix} draft={replyDraft} onDraft={setReplyDraft} />
          : <Text style={ui.muted}>到场后可以接第一句；接过话之后，离开现场也能继续。</Text>}
      </>}
      {!full && !expired && <Text style={ui.muted}>{post.level === 'preview' ? '再走近一些，到场后就能看到全文、照片和接话。' : '这里有人留过话。走近到 200 米内能看到预览，到场后看到全文。'}</Text>}
      {!post.owned && chat.kind !== 'request' && <Action secondary title={chat.label} onPress={() => openChat(chat.chatId)} />}
      {canRequestChat && <Action secondary title="申请私聊（演示权益）" onPress={() => setChatOpen(true)} />}
      <Action secondary title="回到发现" onPress={goDiscover} />
    </ScrollView>
    <ReportSheet visible={reportTarget !== null} target={reportTarget} onClose={() => setReportTarget(null)} onDone={reportDone}
      allowBlock={reportTarget?.kind !== 'post' || post.level !== 'dot'} />
    <ChatRequestSheet visible={chatOpen && chat.kind === 'request'} post={post} fix={position.fix} onClose={() => setChatOpen(false)} onSent={chatSent} />
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
