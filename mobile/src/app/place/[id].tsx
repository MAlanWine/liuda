import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePlaces } from '../../state/places';
import { Action, colors, Loading, moods, ui } from '../../components/ui';

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = usePlaces();
  const [draft, setDraft] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  if (!store.ready) return <Loading />;
  const place = store.places.find(value => value.id === id);
  if (!place) return <View style={[ui.screen, ui.content]}><Text style={ui.title}>这个地点暂时找不到了</Text><Action title="回到发现" onPress={() => router.replace('/')} /></View>;
  const onsite = store.arrived.includes(place.id);
  const unlocked = onsite || place.participated;
  const palette = moods[place.mood];
  return <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
      <View style={styles.placeMeta}><Text style={[ui.muted, { flex: 1 }]}>{place.location}</Text><Pressable onPress={() => store.save(place.id)} accessibilityLabel="切换想去" hitSlop={12}><Ionicons name={store.saved.includes(place.id) ? 'bookmark' : 'bookmark-outline'} size={23} color={colors.accent} /></Pressable></View>
      <Text style={ui.title}>{place.name}</Text>
      <Text style={[ui.muted, { color: colors.accent }]}>{onsite ? '演示已到场 · 完整内容已解锁' : place.participated ? '参与过的对话 · 离场也能继续' : `演示距离约 ${place.distance} 米 · 走近后解锁`}</Text>
      <View style={[ui.panel, { backgroundColor: palette.background }]}><Text style={[ui.body, { color: palette.ink }]}>{unlocked ? place.text : place.teaser}</Text>
        <View style={styles.engagement}><Pressable disabled={!onsite} onPress={() => store.like(place.id)} accessibilityLabel={place.liked ? '取消点赞' : '点赞'} style={styles.like}><Ionicons name={place.liked ? 'heart' : 'heart-outline'} size={19} color={place.liked ? '#e5b9a9' : palette.soft} /><Text style={{ color: palette.soft }}>{place.likes}</Text></Pressable><Text style={[ui.muted, { color: palette.soft }]}>{onsite ? '现场可以点赞' : '点赞需到场'}</Text></View>
      </View>
      {!unlocked && <View style={ui.panel}><Text style={ui.body}>这里的完整留话，留给走近的人。</Text><Text style={ui.muted}>原型用按钮模拟到场。当前没有读取 GPS，也不会改变你的真实位置。</Text><Action title="模拟走近并到场" onPress={() => store.arrive(place.id)} /></View>}
      {place.task && <View style={ui.panel}><Pressable onPress={() => setTaskOpen(!taskOpen)} style={styles.placeMeta}><Text style={[ui.body, { flex: 1 }]}>⚑ {place.task.title}</Text><Text style={{ color: colors.accent }}>¥{place.task.reward} · 演示</Text><Ionicons name={taskOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.muted} /></Pressable>{taskOpen && <Text style={ui.muted}>{place.task.requirement} 此版本不支持任务提交、支付或提现。</Text>}</View>}
      {unlocked && <>
        <View style={styles.placeMeta}><Text style={styles.sectionTitle}>这里的接话</Text><Text style={ui.muted}>{place.replies.length} 句</Text></View>
        {place.replies.length === 0 ? <Text style={ui.muted}>还没有人接话。你可以留下第一句。</Text> : place.replies.map(item => <View key={item.id} style={[ui.panel, item.mine && styles.myReply]}><Text style={ui.muted}>{item.mine ? '我' : '路过的人'}</Text><Text style={ui.body}>{item.text}</Text></View>)}
        <View style={{ gap: 12 }}><Text style={ui.label}>{onsite ? '在这里，接一句' : '离开现场，也能接着聊'}</Text><TextInput value={draft} onChangeText={setDraft} multiline maxLength={300} placeholder="有什么想接着说的？" placeholderTextColor={colors.muted} style={[ui.input, styles.composer]} textAlignVertical="top" accessibilityLabel="接话内容" />
          <View style={styles.placeMeta}><Text style={ui.muted}>{draft.length} / 300</Text><Text style={ui.muted}>匿名 · 仅保存在本机</Text></View>
          <Action title="发送接话" disabled={!draft.trim()} onPress={() => { store.reply(place.id, draft); setDraft(''); }} /></View>
      </>}
      {onsite && <Action secondary title="模拟离开现场" onPress={() => store.depart(place.id)} />}
      {!onsite && unlocked && <Action secondary title="模拟再次到场" onPress={() => store.arrive(place.id)} />}
      <Action secondary title="回到发现" onPress={() => router.replace('/')} />
      <Text style={ui.muted}>演示数据仅用于体验，不对应真实校园留言。首次在现场接话后，该对话会进入「消息」。</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  placeMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  engagement: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  like: { flexDirection: 'row', gap: 7, alignItems: 'center', paddingVertical: 6, paddingRight: 16 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '600' },
  myReply: { borderLeftWidth: 2, borderLeftColor: '#9bae8b' },
  composer: { minHeight: 110 },
});
