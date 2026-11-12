import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { openAppSettings, permissionMessage } from '../../location/permission';
import { usePosition } from '../../state/position';
import { Action, colors, ui } from '../ui';
import { DemoBadge } from './DemoBadge';

/**
 * Location guidance (D-16) for the current permission; renders nothing when GPS is fully usable or in 模拟位置
 * (then it shows the 模拟位置 badge only if `showSimulated`). Every non-granted state (incl. approximate location) offers 改用模拟位置.
 * Approximate location first offers the iOS temporary 精确位置 prompt; if that does not help, the Settings route remains.
 */
export function PermissionHelp({ showSimulated = false }: { showSimulated?: boolean }) {
  const { mode, permission, requestPermission, requestFullAccuracy, setMode } = usePosition();
  const [asking, setAsking] = useState(false);
  const [stillReduced, setStillReduced] = useState(false);
  if (mode === 'simulated') {
    return showSimulated ? <View style={s.row}><DemoBadge label="模拟位置" /><Text style={ui.muted}>位置为模拟，不会读取 GPS。</Text></View> : null;
  }
  if (permission === 'granted') return null;
  const message = permissionMessage(permission);
  const simulate = () => setMode('simulated');
  async function askFullAccuracy() {
    if (asking) return;
    setAsking(true);
    try { setStillReduced((await requestFullAccuracy()) === 'granted-reduced'); }
    finally { setAsking(false); }
  }
  return <View style={ui.panel} accessibilityLiveRegion="polite">
    <Text style={s.title}>{permission === 'granted-reduced' ? '需要精确位置' : permission === 'undetermined' ? '需要定位' : '暂时无法定位'}</Text>
    <Text style={ui.muted}>{message}</Text>
    {permission === 'granted-reduced' && stillReduced ? <Text style={ui.muted}>仍是大致位置。可以在「设置 › 留答 › 位置」长期打开「精确位置」。</Text> : null}
    <View style={s.actions}>
      {permission === 'undetermined' && <Action title="允许定位" onPress={() => { requestPermission(); }} />}
      {permission === 'granted-reduced' && <Action title={asking ? '正在请求…' : '临时开启精确位置'} disabled={asking} onPress={() => { askFullAccuracy(); }} />}
      {permission === 'denied' && <Action title="去设置开启" onPress={() => { openAppSettings(); }} />}
      {permission === 'granted-reduced' && <Action secondary title="去设置开启" onPress={() => { openAppSettings(); }} />}
      {permission === 'services-off' && <Action title="打开定位服务" onPress={() => { openAppSettings(); }} />}
      <Action secondary title="改用模拟位置" onPress={simulate} />
    </View>
  </View>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  actions: { gap: 8 },
});
