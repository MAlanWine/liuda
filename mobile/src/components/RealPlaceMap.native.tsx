import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import type { Fix, Point } from '../location/geo';

export default function RealPlaceMap({ point, fix, currentOnly = false }: { point: Point; fix: Fix | null; currentOnly?: boolean }) {
  const [aspect, setAspect] = useState(0);
  const center = fix ?? point;
  const metersPerLatitudeDegree = 111_195;
  const metersPerLongitudeDegree = metersPerLatitudeDegree
    * Math.max(0.01, Math.cos(center.latitude * Math.PI / 180));
  const eastWestGap = Math.abs(((point.longitude - center.longitude + 540) % 360) - 180)
    * metersPerLongitudeDegree;
  const northSouthGap = Math.abs(point.latitude - center.latitude) * metersPerLatitudeDegree;
  // Size the viewport in meters first so a wide preview doesn't zoom out to fit a square region.
  const heightForPoint = 2.7 * Math.max(northSouthGap, eastWestGap / Math.max(aspect, 0.01));
  const maximumHeight = 2_000 / Math.hypot(1, aspect);
  const heightMeters = Math.min(maximumHeight, Math.max(currentOnly ? 60 : 110, heightForPoint));
  const region = {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: heightMeters / metersPerLatitudeDegree,
    longitudeDelta: heightMeters * aspect / metersPerLongitudeDegree,
  };
  return (
    <View
      style={[styles.frame, currentOnly && styles.compact]}
      onLayout={({ nativeEvent: { layout: { width, height } } }) => {
        if (width > 0 && height > 0) setAspect(width / height);
      }}
    >
      {aspect > 0 && <MapView style={StyleSheet.absoluteFill} region={region} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}>
        {!currentOnly && <Marker coordinate={point} title="留话地点" pinColor="#ffffff" />}
        {fix && <Circle center={fix} radius={Math.max(3, Math.min(fix.accuracy ?? 3, 100))} fillColor="#299be333" strokeColor="#299be3" strokeWidth={1} />}
        {fix && <Marker coordinate={fix} title="你的位置" anchor={{ x: 0.5, y: 0.5 }} centerOffset={{ x: 0, y: 0 }} zIndex={2}><View style={styles.dot} /></Marker>}
      </MapView>}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 190, borderRadius: 18, overflow: 'hidden', backgroundColor: '#1a2225' },
  compact: { height: 112, borderRadius: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#299be3', borderColor: '#fff', borderWidth: 2 },
});
