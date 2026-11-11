import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Action, ui } from '../components/ui';
export default function AboutPrivacyScreen() {
  return <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
    <Text style={ui.title}>关于匿名与数据</Text><Text style={ui.muted}>App 原型说明 · 非正式服务协议</Text>
    <View style={ui.panel}><Text style={ui.body}>匿名的是你的公开身份。</Text><Text style={ui.muted}>正式服务计划通过账号保存参与记录，让你离场或换设备后继续对话。不要求使用真实姓名，手机号不作为公开资料。头像和昵称由你自己选择，可以保持一致；完整留言历史和活动地点不向他人提供。当前还没有账号服务，也没有完成跨设备恢复。</Text></View>
    <View style={ui.panel}><Text style={ui.body}>当前体验，留在这台设备。</Text><Text style={ui.muted}>本机保存头像、昵称、演示留话、接话、收藏与是否已看过欢迎页。选择的头像图片会在设备上处理后保存。获得位置授权后，留答读取前台位置来显示当前位置并计算距离。手机端会使用系统地图和地址服务来显示你附近的位置。启用高德地名查询的预览版会将坐标发给高德查询小区或建筑名。你在现场留下文字时，地点坐标随留话保存在本机。打开步行路线时，目的地点会交给地图服务。查看实拍街景时，会向百度地图查询留言点坐标附近的画面。当前不采集手机号，也不上传留话。清除应用数据或浏览器站点存储会清除本机记录。</Text></View>
    <Text style={ui.muted}>正式账号、定位和云端服务上线前，会补齐相应隐私说明及授权流程。</Text>
    <Action secondary title="返回" onPress={() => router.canGoBack() ? router.back() : router.replace('/welcome')} />
  </ScrollView>;
}
