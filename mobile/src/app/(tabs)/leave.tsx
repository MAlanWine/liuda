import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePlaces } from '../../state/places';
import { Action, colors, Loading, Screen, ui } from '../../components/ui';

export default function LeaveScreen() {
  const store = usePlaces();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [text, setText] = useState('');
  const [onsite, setOnsite] = useState(false);
  if (!store.ready) return <Loading />;
  return <Screen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <Text style={ui.muted}>留下一句，让后来的人遇见。</Text><Text style={ui.title}>{'这个地方，\n你想说点什么？'}</Text>
      <Text style={ui.muted}>不需要好看的照片。一个准确的位置，一句自己的话，就够了。</Text>
      <View><Text style={ui.label}>给这个小地点起个名字</Text><TextInput value={name} onChangeText={setName} maxLength={40} placeholder="例如：西门第一张长椅" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="地点名称" /></View>
      <View><Text style={ui.label}>在哪里能找到它</Text><TextInput value={location} onChangeText={setLocation} maxLength={80} placeholder="例如：图书馆西门，梧桐树下" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="具体位置" /></View>
      <View><Text style={ui.label}>留话</Text><TextInput value={text} onChangeText={setText} multiline maxLength={300} placeholder="一个吐槽、提醒、问题，或者一句玩笑……" placeholderTextColor={colors.muted} style={[ui.input, { minHeight: 150 }]} textAlignVertical="top" accessibilityLabel="留话内容" /><Text style={[ui.muted, { textAlign: 'right', marginTop: 8 }]}>{text.length} / 300</Text></View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: onsite }} onPress={() => setOnsite(!onsite)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10 }}><Ionicons name={onsite ? 'checkbox' : 'square-outline'} size={25} color={colors.accent} /><Text style={[ui.body, { flex: 1, fontSize: 15 }]}>确认模拟到场（仅用于本机演示）</Text></Pressable>
      <Action title="在这里留下" disabled={!name.trim() || !location.trim() || !text.trim() || !onsite} onPress={() => {
        const id = store.create(name, location, text);
        setName(''); setLocation(''); setText(''); setOnsite(false);
        router.push({ pathname: '/place/[id]', params: { id } });
      }} />
      <Text style={ui.muted}>当前不采集真实位置，也不会发布到公共平台。正式版的到场校验与内容审核将由服务端完成。</Text>
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}
