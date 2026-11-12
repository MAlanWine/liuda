// Pure display rule for a PublicAuthor row (Author.tsx).
import type { PublicAuthor } from '../api/types.ts';

/**
 * Name + badges. Me -> my own profile nickname + 我 (+ 楼主). Others -> their per-thread alias (路人 XXXX) + 楼主 when they
 * wrote the post; a server that labels the OP plainly 「楼主」 never gets a second 楼主 badge.
 */
export function authorLabel(author: PublicAuthor, myNickname: string): { name: string; badges: string[]; simulated: boolean } {
  const name = author.isMe ? myNickname : author.nickname;
  const badges: string[] = [];
  if (author.isMe) badges.push('我');
  if (author.isOriginalPoster && name !== '楼主') badges.push('楼主');
  return { name, badges, simulated: author.simulated && !author.isMe };
}
