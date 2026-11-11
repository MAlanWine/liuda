import { useEffect, useRef, useState } from 'react';
import { Link } from 'expo-router';
import { Image, Text, View } from 'react-native';
import type { Point } from '../location/geo';
import { Action, ui } from './ui';

export function StreetViewPreview({ point }: { point: Point }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState('');
  const [notice, setNotice] = useState('');
  const [showSample, setShowSample] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function toggle() {
    if (open) {
      request.current?.abort();
      setOpen(false);
      return;
    }
    setOpen(true);
    if (image) return;
    setShowSample(false);
    setNotice('正在查找街景…');
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch('/api/street-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(point),
        signal: controller.signal,
      });
      const result = await response.json() as { status: string; image?: string };
      if (controller.signal.aborted) return;
      if (response.ok && result.status === 'ok' && result.image) {
        setImage(result.image);
        setNotice('');
      } else if (result.status === 'no-coverage') {
        setNotice('这个留言点附近暂无街景，仍可参考上方地图。');
      } else if (result.status === 'unconfigured') {
        setNotice('街景服务尚未开通。');
        setShowSample(true);
      } else {
        setNotice('街景暂时无法加载，可以收起后重试。');
      }
    } catch {
      if (!controller.signal.aborted) setNotice('街景暂时无法加载，可以收起后重试。');
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Action secondary title={open ? '收起街景' : '看街景'} onPress={toggle} />
      {open && image ? <>
        <Image source={{ uri: image }} accessibilityLabel="留言点附近的百度实拍街景" style={{ width: '100%', aspectRatio: 2, borderRadius: 16 }} resizeMode="contain" />
        <Text style={ui.muted}>百度地图街景 · 拍摄位置以道路实景为准</Text>
      </> : null}
      {open && showSample && <Link href="/street-view-demo" style={[ui.body, { textDecorationLine: 'underline' }]}>查看公开地点演示</Link>}
      {open && notice ? <Text style={ui.muted} accessibilityLiveRegion="polite">{notice}</Text> : null}
    </View>
  );
}
