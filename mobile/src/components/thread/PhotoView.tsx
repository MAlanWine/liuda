import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, describeError, type PostSummary } from '../../api';
import { stampPosition, usePosition } from '../../state/position';
import { colors, ui } from '../ui';

type PhotoState = { status: 'loading' } | { status: 'ready'; uri: string } | { status: 'none' } | { status: 'error'; message: string };

/**
 * The post's private photo via `api.photo` (participants without position, others with the current fix).
 * Loaded while the screen is focused; the data URI is dropped on blur/unmount so it does not linger in memory.
 */
export function PhotoView({ post }: { post: PostSummary }) {
  const { fix } = usePosition();
  const latest = useRef({ fix, participated: post.participated });
  useEffect(() => { latest.current = { fix, participated: post.participated }; });
  const [state, setState] = useState<PhotoState>({ status: 'loading' });
  const postId = post.id;

  useFocusEffect(useCallback(() => {
    let active = true;
    const { fix: current, participated } = latest.current;
    const position = !participated && current ? { position: stampPosition(current) } : {};
    api.photo({ postId, ...position })
      .then(res => { if (active) setState(res.dataUri ? { status: 'ready', uri: res.dataUri } : { status: 'none' }); })
      .catch(e => { if (active) setState({ status: 'error', message: describeError(e) }); });
    return () => { active = false; setState({ status: 'loading' }); };
  }, [postId]));

  if (state.status === 'ready') {
    return <Image source={{ uri: state.uri }} style={s.photo} resizeMode="cover" accessible accessibilityLabel="留话现场照片" />;
  }
  return <View style={[s.photo, s.placeholder]} accessibilityLiveRegion="polite">
    {state.status === 'loading'
      ? <ActivityIndicator color={colors.accent} accessibilityLabel="正在加载照片" />
      : <Text style={ui.muted}>{state.status === 'error' ? state.message : '图片暂不可用。'}</Text>}
  </View>;
}

const s = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: colors.raised },
  placeholder: { alignItems: 'center', justifyContent: 'center', padding: 16 },
});
