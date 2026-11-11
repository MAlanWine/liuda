import { useState } from 'react';
import { Link } from 'expo-router';
import { Image, ScrollView, Text, View } from 'react-native';
import { PlaceMiniMap } from '../components/PlaceMiniMap';
import { Action, Screen, ui } from '../components/ui';

const photoPage = 'https://commons.wikimedia.org/wiki/File:Beijing_Qianmen_Street_-_panoramio.jpg';
const photo = 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Beijing_Qianmen_Street_-_panoramio.jpg';

export default function StreetViewDemo() {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <Screen>
      <ScrollView contentContainerStyle={ui.content}>
        <View style={{ gap: 4 }}>
          <Text style={ui.title}>北京前门大街</Text>
          <Text style={ui.muted}>公开地点演示</Text>
        </View>
        <PlaceMiniMap distance={35} onsite={false} location="模拟你与留言点的位置" />
        <Action secondary title={open ? '收起街景' : '看街景'} onPress={() => {
          setFailed(false);
          setOpen(!open);
        }} />
        {open && <View style={{ gap: 8 }}>
          {failed
            ? <Text style={ui.muted}>照片暂时无法加载，可点下方来源查看。</Text>
            : <Image source={{ uri: photo }} accessibilityLabel="北京前门大街实拍照片" onError={() => setFailed(true)} style={{ width: '100%', aspectRatio: 1.5, borderRadius: 16 }} resizeMode="contain" />}
          <Text style={ui.muted}>前门大街实拍 · 2012 年</Text>
          <Text style={ui.muted}>
            <Link href={photoPage} style={{ textDecorationLine: 'underline' }}>The Erica Chang / Wikimedia Commons</Link>
            {' · '}
            <Link href="https://creativecommons.org/licenses/by/3.0/" style={{ textDecorationLine: 'underline' }}>CC BY 3.0</Link>
          </Text>
        </View>}
      </ScrollView>
    </Screen>
  );
}
