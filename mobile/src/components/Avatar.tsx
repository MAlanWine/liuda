import { useState } from 'react';
import { Image } from 'react-native';

export function Avatar({ uri, size = 42 }: { uri?: string | null; size?: number }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const custom = uri && uri !== failedUri;
  return <Image accessible={false} source={custom ? { uri } : require('../../assets/liuda-comma.png')}
    onError={() => { if (uri) setFailedUri(uri); }}
    style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#080909', resizeMode: 'cover' }} />;
}
