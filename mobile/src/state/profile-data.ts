export type Profile = { version: 1; nickname: string; avatar: string | null };
export const defaultProfile: Profile = { version: 1, nickname: '路过的人', avatar: null };

export function normalizeProfile(input: { nickname: string; avatar: string | null }): Profile {
  const nickname = input.nickname.trim();
  if (!nickname || Array.from(nickname).length > 16 || /[\u0000-\u001f\u007f-\u009f]/u.test(nickname)) {
    throw new Error('昵称请填写 1–16 个字，不含换行。');
  }
  if (input.avatar !== null && (typeof input.avatar !== 'string' || input.avatar.length > 350000
    || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.avatar))) {
    throw new Error('头像图片无效，请重新选择一张。');
  }
  return { version: 1, nickname, avatar: input.avatar };
}

export function decodeProfile(raw: string | null): Profile {
  if (raw === null) return { ...defaultProfile };
  const value = JSON.parse(raw);
  if (!value || value.version !== 1 || typeof value.nickname !== 'string'
    || !(value.avatar === null || typeof value.avatar === 'string')) throw new Error('Invalid profile record');
  return normalizeProfile(value);
}
