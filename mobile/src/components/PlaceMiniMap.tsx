import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

const center = 64;
const rangeMeters = 30;
const rangeRadius = 48;
const rings = [10, 20, rangeMeters];

export function PlaceMiniMap({ distance, onsite, location }: { distance: number; onsite: boolean; location: string }) {
  const hasDistance = Number.isFinite(distance) && distance > 0;
  const radius = hasDistance ? Math.min(distance / rangeMeters, 1) * rangeRadius : 0;
  const noteX = onsite ? center : center + radius;
  const status = onsite ? '已到场' : hasDistance ? `约 ${Math.round(distance)} 米` : '距离未知';
  const scaleLabel = hasDistance && !onsite && distance > rangeMeters
    ? '超出 30 米示意范围'
    : '距离示意 · 非导航';

  return (
    <View accessible accessibilityLabel={`留话距离${status}。现场位置：${location}。${scaleLabel}`} style={styles.row}>
      <View style={styles.map}>
        <Svg width={128} height={128} viewBox="0 0 128 128">
          {rings.map(meters => (
            <Circle key={meters} cx={center} cy={center} r={meters / rangeMeters * rangeRadius} stroke="#354247" fill="none" />
          ))}
          {onsite && <Circle cx={center} cy={center} r={12} stroke="#f1f4ef" fill="none" />}
          {!onsite && hasDistance && (
            <>
              <Line x1={center} y1={center} x2={noteX} y2={center} stroke="#90a1a6" strokeDasharray="2 3" />
              <Circle cx={noteX} cy={center} r={3} fill="#f1f4ef" />
            </>
          )}
          <Circle cx={center} cy={center} r={5.5} fill="#309de3" stroke="#dcf1ff" strokeWidth={1.5} />
        </Svg>
        {(onsite || hasDistance) && (
          <Text style={[styles.note, { left: noteX - 10, top: center - 30 }]}>❜</Text>
        )}
        <Text style={styles.you}>你</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.distance}>{status}</Text>
        <Text style={styles.location}>{location}</Text>
        <Text style={styles.caption}>{scaleLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  map: { width: 128, height: 128, backgroundColor: '#1a2225', borderRadius: 64, overflow: 'hidden' },
  info: { flex: 1, gap: 4 },
  distance: { fontSize: 25, fontWeight: '600', color: '#f1f4ef' },
  location: { fontSize: 14, lineHeight: 21, color: '#d3dbd9' },
  caption: { fontSize: 11, lineHeight: 17, color: '#a6b1b5' },
  note: { position: 'absolute', width: 20, height: 20, borderRadius: 10, overflow: 'hidden', backgroundColor: '#394346', color: '#fff', textAlign: 'center', fontSize: 16, lineHeight: 20 },
  you: { position: 'absolute', top: 75, left: 52, width: 24, textAlign: 'center', color: '#c1e8ff', fontSize: 11 },
});
