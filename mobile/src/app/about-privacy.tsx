import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Action, ui } from '../components/ui';
export default function AboutPrivacyScreen() {
  return <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
    <Text style={ui.title}>关于匿名与数据</Text><Text style={ui.muted}>App 原型说明 · 非正式服务协议</Text>
    <View style={ui.panel}><Text style={ui.body}>匿名的是你的公开身份。</Text><Text style={ui.muted}>正式服务计划通过账号保存参与记录，让你离场或换设备后继续对话。对其他用户不展示手机号或真实姓名。当前还没有账号服务，也没有完成跨设备恢复。</Text></View>
    <View style={ui.panel}><Text style={ui.body}>当前体验，留在这台设备。</Text><Text style={ui.muted}>本机保存演示留话、接话、收藏与是否已看过欢迎页。当前不读取真实 GPS，不采集手机号，也不上传这些演示记录。清除应用数据或浏览器站点存储会清除本机记录。</Text></View>
    <Text style={ui.muted}>正式账号、定位和云端服务上线前，会补齐相应隐私说明及授权流程。</Text>
    <Action secondary title="返回" onPress={() => router.canGoBack() ? router.back() : router.replace('/welcome')} />
  </ScrollView>;
}
