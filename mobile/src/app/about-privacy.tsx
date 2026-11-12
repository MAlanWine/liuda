import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { DemoBadge } from '../components/common/DemoBadge';
import { Action, colors, ui } from '../components/ui';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '匿名的是你的公开身份',
    body: [
      '别人看不到你的昵称、头像和账号。在每条对话里，你只显示为一个临时代称，比如「路人 3F2A」；留话的人在自己的对话里显示为「楼主」。',
      '代称只在那一条对话里有效，换一条对话就不一样，别人没法把你在不同地方说的话连起来。',
      '你留过的话、参与过的对话、想去的地方和屏蔽名单，只有你自己看得到。',
    ],
  },
  {
    title: '现在的数据都在这台手机上',
    body: [
      '这一版没有连接任何服务器。账号、留话、接话、私聊、收藏和举报，都保存在 App 内置的模拟后端里，只存在这台手机。',
      '微信和 Apple 登录都是演示，不会连接微信或 Apple，也不会读取你在那里的资料。页面里标着「模拟用户」的人也是演示数据。',
      '删除 App 会清除这些数据；换手机暂时不能恢复。在「演示与模拟」里可以随时重置演示数据。',
    ],
  },
  {
    title: '位置怎么用',
    body: [
      '获得授权后，留答只在使用中读取位置，用来算出你离各条留话有多远、判断你是不是到了现场。这个判断在手机里的模拟后端完成。',
      '你留话时，地点坐标会随留话一起保存在本机。打开步行路线时，目的地会交给 Apple 地图。查地点名称时，会用系统（Apple）的地址服务，坐标会发给 Apple。',
      '不想用真实定位，可以在「演示与模拟」里改用模拟位置。',
    ],
  },
  {
    title: '照片',
    body: [
      '留话配图只能在现场用相机拍，不读取相册。头像可以从相册选一张，在手机上裁剪、压缩后保存，只有你自己看得到。',
    ],
  },
  {
    title: '只在开发版里有的功能',
    body: [
      '高德地名查询和百度街景只在开发版本里可用：开发版会把坐标发给高德，查附近的建筑名称；或发给百度地图，查附近的街景画面。',
      '安装到手机上的正式构建不包含这两项。',
    ],
  },
];

export default function AboutPrivacyScreen() {
  return <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
    <View style={s.head}>
      <Text accessibilityRole="header" style={ui.title}>关于匿名与数据</Text>
      <View style={s.tags}><DemoBadge label="演示版说明" /><Text style={ui.muted}>不是正式服务协议</Text></View>
    </View>
    {SECTIONS.map(section => <View key={section.title} style={ui.panel}>
      <Text accessibilityRole="header" style={s.title}>{section.title}</Text>
      {section.body.map(line => <Text key={line} style={s.body}>{line}</Text>)}
    </View>)}
    <Text style={ui.muted}>接入正式账号和云端服务之前，会先补齐对应的隐私说明和授权流程。</Text>
    <Action secondary title="返回" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/welcome'); }} />
  </ScrollView>;
}
const s = StyleSheet.create({
  head: { gap: 8 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: 17, lineHeight: 26, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 23 },
});
