import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { AuthMethod } from '../../api';
import { colors } from '../ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Display names + icons for the mock sign-in methods (演示账号; no real WeChat / Apple SDK). */
export const AUTH_METHODS: Record<AuthMethod, { name: string; icon: IconName }> = {
  wechat: { name: '微信', icon: 'logo-wechat' },
  apple: { name: 'Apple', icon: 'logo-apple' },
  guest: { name: '游客', icon: 'person-outline' },
};
export const AUTH_METHOD_ORDER: readonly AuthMethod[] = ['wechat', 'apple', 'guest'];

/**
 * One row in a settings-style list (我 / 账号与登录 / 演示与模拟). Pressable when `onPress` is given (then shows a chevron
 * unless `chevron={false}`); `value` is right-aligned text (counts, 当前), `badge` sits after the title (e.g. `<DemoBadge />`).
 * `divider` draws a hairline above the row, for rows inside one group. `accessory` renders at the right edge (e.g. a `Switch`);
 * a row with an accessory and no `onPress` is not grouped for accessibility, so the control stays focusable.
 */
export function AccountRow({ icon, title, subtitle, value, badge, accessory, onPress, divider = false, chevron, disabled = false, tone = 'default', accessibilityLabel }: {
  icon?: IconName; title: string; subtitle?: string; value?: string; badge?: ReactNode; accessory?: ReactNode; onPress?: () => void;
  divider?: boolean; chevron?: boolean; disabled?: boolean; tone?: 'default' | 'danger'; accessibilityLabel?: string;
}) {
  const showChevron = chevron ?? !!onPress;
  const body = <>
    {icon ? <Ionicons name={icon} size={21} color={tone === 'danger' ? colors.danger : colors.subtle} /> : null}
    <View style={s.text}>
      <View style={s.titleRow}>
        <Text style={[s.title, tone === 'danger' && s.danger]} numberOfLines={2}>{title}</Text>
        {badge}
      </View>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </View>
    {value ? <Text style={s.value}>{value}</Text> : null}
    {accessory}
    {showChevron ? <Ionicons name="chevron-forward" size={15} color={colors.inactive} /> : null}
  </>;
  if (!onPress) {
    return <View accessible={!accessory} accessibilityLabel={accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join('，')} style={[s.row, divider && s.divider]}>{body}</View>;
  }
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [title, value].filter(Boolean).join('，')}
    accessibilityHint={subtitle} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.row, divider && s.divider, disabled && s.disabled, pressed && s.pressed]}>
    {body}
  </Pressable>;
}

/** Rounded surface that groups `AccountRow`s, with an optional small heading above it. */
export function AccountGroup({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return <View style={s.groupWrap}>
    {title || aside ? <View style={s.groupHeader}>
      {title ? <Text accessibilityRole="header" style={s.groupTitle}>{title}</Text> : <View />}
      {aside}
    </View> : null}
    <View style={s.group}>{children}</View>
  </View>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 14 },
  divider: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: { color: colors.text, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  danger: { color: colors.danger },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  value: { color: colors.subtle, fontSize: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.6 },
  groupWrap: { gap: 10 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2 },
  groupTitle: { color: colors.subtle, fontSize: 13 },
  group: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 18 },
});
