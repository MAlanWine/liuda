import { useEffect, useState } from 'react';
import { router, usePathname } from 'expo-router';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedLogo } from '../components/AnimatedLogo';
import { useEntry } from '../state/entry';

type Step = 'hello' | 'unavailable' | 'demo';

const dialogue = {
  hello: ['嗨，我是 Liuda。', '想不想知道附近有过哪些人，发生过哪些事？'],
  unavailable: ['这版还看不了你身边的留话。', '想先看看，路过的人会给一个地方留下什么吗？'],
  demo: ['这张长椅上，有人留了句话。', '走近一点，就能看到更多。到了现场，还能接一句。'],
} as const;

function Dialogue({ step, canSpeak, reduceMotion }: { step: Step; canSpeak: boolean; reduceMotion: boolean }) {
  const lines = dialogue[step];
  const letters = Array.from(lines.join(''));
  const [visible, setVisible] = useState(0);

  const done = reduceMotion === true || visible >= letters.length;
  const previous = letters[visible - 1] ?? '';
  const delay = visible === 0 ? 160 : /[，。？！]/.test(previous) ? 185 : 52;
  useEffect(() => {
    if (done || !canSpeak) return;
    const timer = setTimeout(() => setVisible(count => count + 1), delay);
    return () => clearTimeout(timer);
  }, [canSpeak, delay, done, visible]);

  const firstLength = Array.from(lines[0]).length;
  return (
    <Pressable
      style={styles.words}
      accessible
      accessibilityLabel={lines.join(' ')}
      onPress={() => setVisible(letters.length)}
    >
      {step === 'demo' && <Text style={styles.quiet}>演示 · 模拟地点</Text>}
      {lines.map((line, index) => {
        const glyphs = Array.from(line);
        const count = done ? glyphs.length : Math.max(0, Math.min(glyphs.length, visible - (index === 0 ? 0 : firstLength)));
        const isQuestion = index === (step === 'hello' ? 1 : 0);
        return (
          <Text key={line} style={isQuestion ? styles.question : step === 'hello' ? styles.greeting : styles.quiet}>
            {glyphs.slice(0, count).join('')}
            <Text style={styles.unrevealed}>{glyphs.slice(count).join('')}</Text>
          </Text>
        );
      })}
    </Pressable>
  );
}

export default function OnboardingScreen() {
  const [step, setStep] = useState<Step>('hello');
  const [entrance] = useState(() => new Animated.Value(0));
  const [arrived, setArrived] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    let changed = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (active && !changed) setReduceMotion(value); })
      .catch(() => { if (active && !changed) setReduceMotion(false); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      setReduceMotion(value);
    });
    return () => { active = false; listener.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion === null || arrived) return;
    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 1320,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start(({ finished }) => { if (finished) setArrived(true); });
    return () => animation.stop();
  }, [arrived, entrance, reduceMotion]);

  const canSpeak = arrived || reduceMotion === true;
  const { begin } = useEntry();
  const pathname = usePathname();

  function finish(destination: '/discover' | '/place/bench') {
    begin();
    router.replace(destination);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" onPress={() => finish('/discover')} style={styles.skip}>
          <Text style={styles.quiet}>跳过</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <View style={styles.dialogue}>
          <View style={styles.entranceStage}>
            <Animated.View pointerEvents="none" style={[styles.ripple, {
              opacity: entrance.interpolate({ inputRange: [0, 0.28, 0.43, 0.85, 1], outputRange: [0, 0, 0.55, 0, 0] }),
              transform: [{ scale: entrance.interpolate({ inputRange: [0, 0.28, 0.85, 1], outputRange: [0.15, 0.15, 2.6, 2.6] }) }],
            }]} />
            <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.ink, {
              opacity: entrance.interpolate({ inputRange: [0, 0.13, 0.35, 0.56, 1], outputRange: [0, 1, 1, 0, 0] }),
              transform: [
                { translateY: entrance.interpolate({ inputRange: [0, 0.13, 0.32, 0.56, 1], outputRange: [14, 5, 7, 0, 0] }) },
                { scale: entrance.interpolate({ inputRange: [0, 0.13, 0.32, 0.56, 1], outputRange: [0.35, 1.15, 1, 1.7, 1.7] }) },
                { rotate: entrance.interpolate({ inputRange: [0, 0.32, 0.56, 1], outputRange: ['0deg', '0deg', '-22deg', '-22deg'] }) },
              ],
            }]}>
              <Text style={styles.comma}>,</Text>
            </Animated.View>
            <Animated.View style={{
              opacity: entrance.interpolate({ inputRange: [0, 0.35, 0.63, 1], outputRange: [0, 0, 1, 1] }),
              transform: [
                { rotate: entrance.interpolate({ inputRange: [0, 0.35, 0.74, 0.88, 1], outputRange: ['-22deg', '-22deg', '7deg', '-3deg', '0deg'] }) },
                { scale: entrance.interpolate({ inputRange: [0, 0.35, 0.69, 0.86, 1], outputRange: [0.36, 0.36, 1.08, 0.98, 1] }) },
              ],
            }}>
              <AnimatedLogo size={158} active={arrived && pathname === '/onboarding'} blinkOnStart />
            </Animated.View>
          </View>
          <Dialogue key={step} step={step} canSpeak={canSpeak} reduceMotion={reduceMotion === true} />
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (step === 'hello') setStep('unavailable');
              else if (step === 'unavailable') setStep('demo');
              else finish('/place/bench');
            }}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>
              {step === 'hello' ? '看看附近' : step === 'unavailable' ? '看一个演示' : '看看这条留话'}
            </Text>
            <Ionicons name="arrow-forward" size={19} color="#101010" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  top: { alignItems: 'flex-end', paddingHorizontal: 20 },
  skip: { minHeight: 44, minWidth: 56, justifyContent: 'center', alignItems: 'center' },
  content: { flexGrow: 1, paddingHorizontal: 30, paddingBottom: 24 },
  dialogue: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 22, paddingVertical: 24 },
  entranceStage: { width: 158, height: 158, justifyContent: 'center', alignItems: 'center' },
  ink: { position: 'absolute', width: 84, height: 84, justifyContent: 'center', alignItems: 'center' },
  comma: { color: '#fff', fontFamily: 'serif', fontWeight: '700', fontSize: 82, lineHeight: 82, marginTop: -37 },
  ripple: { position: 'absolute', width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: '#e9e7e2' },
  words: { alignSelf: 'stretch', gap: 12, paddingHorizontal: 4 },
  unrevealed: { color: 'transparent' },
  greeting: { color: '#b8b8b8', fontSize: 16, lineHeight: 24 },
  question: { color: '#f4f4f4', fontSize: 27, lineHeight: 39, fontWeight: '600' },
  quiet: { color: '#a6a6a6', fontSize: 14, lineHeight: 23 },
  actions: { paddingTop: 14 },
  primary: { minHeight: 56, backgroundColor: '#f4f4f4', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  buttonText: { color: '#101010', fontSize: 16, fontWeight: '600', flexShrink: 1 },
  pressed: { opacity: 0.75 },
});
