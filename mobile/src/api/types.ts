// Contract: a-doc ARCHITECTURE §2 verbatim. `{}` = "no request fields" by design.
/* eslint-disable @typescript-eslint/no-empty-object-type */
export type Crs = 'wgs84' | 'gcj02';                       // mock accepts 'wgs84' only (INVALID_LOCATION otherwise)
export type GeoPoint = { latitude: number; longitude: number };
export type PositionEvidence = GeoPoint & { crs: Crs; accuracy: number | null; timestamp: number; source: 'gps' | 'simulated' };
export type AuthMethod = 'wechat' | 'apple' | 'guest';
/** `accountKey`: opaque, stable per account (not the account id) — keys client-side marks such as inbox seen. */
export type Session = { token: string; method: AuthMethod; accountLabel: string; accountKey: string; createdAt: number; mock: true };
export type PublicProfile = { nickname: string; avatar: string | null };      // avatar = data:image/jpeg;base64 (profile-data rules)
export type PublicAuthor = PublicProfile & { isMe: boolean; isOriginalPoster: boolean; simulated: boolean };
export type Tier = 'dot' | 'preview' | 'full';
export type AccessMode = 'participant' | 'onsite' | 'nearby';
export type Mood = 'sage' | 'sand' | 'blue';
export type PlaceArt = 'bench' | 'stairs' | 'corner';
export type DemoTask = { title: string; reward: number; requirement: string };  // display only, labelled 演示
type PostBase = {
  id: string; sceneId: string; name: string; latitude: number; longitude: number; crs: 'wgs84';
  distance: number | null; distanceLabel: string; participated: boolean; accessMode: AccessMode;
  canInteract: boolean; canReply: boolean; canLike: boolean;               // server-made; never sent back as authority
  commentCount: number; likes: number; liked: boolean; saved: boolean; owned: boolean;
  replyParticipantCount: number; lastEngagedAt: number; createdAt: number; // heat inputs (B11), D-15
  mood: Mood; art: PlaceArt | null; task: DemoTask | null; demo: boolean; readExpiresAt: number;
};
export type PostSummary =
  | (PostBase & { level: 'dot'; displayText: string; teaser: ''; text: ''; clue: ''; hasPhoto: false; author: null })
  | (PostBase & { level: 'preview'; displayText: string; teaser: string; text: ''; clue: string; hasPhoto: false; author: null })
  | (PostBase & { level: 'full'; displayText: string; teaser: string; text: string; clue: string; hasPhoto: boolean; author: PublicAuthor });
export type Comment = { id: string; text: string; author: PublicAuthor; mine: boolean; entry: 'onsite' | 'continuation'; createdAt: number };
export type ThreadView = { post: PostSummary; comments: Comment[] };         // comments = [] unless post.level === 'full'
export type ThreadMeta = { id: string; name: string; owned: boolean; participated: true; commentCount: number; createdAt: number; updatedAt: number };
export type InboxEvent = { id: string; postId: string; name: string; type: 'reply'; createdAt: number };  // 回应: latest per thread, ≤20, never caused by me
export type ChatState = 'pending' | 'active' | 'declined' | 'cancelled' | 'destroyed';
export type ChatMeta = { id: string; postId: string; placeName: string; state: ChatState; role: 'requester' | 'author';
  peer: PublicAuthor; greeting: string; createdAt: number; updatedAt: number; lastMessageAt: number | null };
export type ChatMessage = { id: string; chatId: string; text: string; mine: boolean; createdAt: number };
export type ReportTarget = { kind: 'post'; postId: string } | { kind: 'comment'; postId: string; commentId: string }
  | { kind: 'chat'; chatId: string; messageId?: string };
export type ReportReason = 'spam' | 'abuse' | 'privacy' | 'illegal' | 'other';
export type BlockEntry = { id: string; label: string; createdAt: number };  // label e.g. 在「第一张长椅」遇到的人 — no user id
export type PresencePurpose = 'post' | 'comment' | 'like' | 'photo' | 'chat';
export type DemoSettings = { latencyMs: [number, number]; flakyWrites: boolean; simulatedUsers: boolean;
  anchor: GeoPoint | null; anchorSource: 'fix' | 'simulated' | null };
type W = { requestId: string };                                             // idempotent write
type Onsite = W & { ticket: string; position: PositionEvidence };
export type ApiActions = {
  signIn: { req: { method: AuthMethod; profile?: PublicProfile }; res: Session };
  signOut: { req: {}; res: { signedOut: true } };
  status: { req: {}; res: { protocol: 2; member: boolean; method: AuthMethod; mock: boolean; accountKey: string } };
  join: { req: { inviteCode: string }; res: { joined: true; protocol: 2 } };
  me: { req: {}; res: { profile: PublicProfile; method: AuthMethod; createdAt: number } };
  updateProfile: { req: PublicProfile; res: { profile: PublicProfile } };
  nearby: { req: { position: PositionEvidence }; res: { posts: PostSummary[]; limited: boolean } };
  thread: { req: { postId: string; position?: PositionEvidence }; res: ThreadView };
  presence: { req: { purpose: PresencePurpose; postId?: string; position: PositionEvidence }; res: { ticket: string; expiresAt: number } };
  post: { req: Onsite & { text: string; name: string; clue?: string; sceneId?: string; photoId?: string }; res: { id: string; createdAt: number } };
  comment: { req: Onsite & { postId: string; text: string }; res: CommentReceipt };
  continueComment: { req: W & { postId: string; text: string }; res: CommentReceipt };
  like: { req: Onsite & { postId: string; desired: boolean }; res: { id: string; liked: boolean; likes: number } };
  uploadPhoto: { req: Onsite & { base64: string; contentType: 'image/jpeg' }; res: { photoId: string; expiresAt: number } };
  photo: { req: { postId: string; position?: PositionEvidence }; res: { dataUri: string | null } };
  delete: { req: W & { postId: string }; res: { id: string } };
  bookmark: { req: { postId: string; saved: boolean }; res: { postId: string; saved: boolean } };
  bookmarks: { req: { position?: PositionEvidence }; res: { posts: PostSummary[] } };
  mine: { req: {}; res: { posts: ThreadMeta[] } };
  conversations: { req: {}; res: { threads: ThreadMeta[] } };
  activity: { req: {}; res: { events: InboxEvent[] } };
  inbox: { req: {}; res: { threads: ThreadMeta[]; mine: ThreadMeta[]; events: InboxEvent[]; chats: ChatMeta[] } };
  report: { req: W & { target: ReportTarget; reason: ReportReason; note?: string }; res: { reportId: string; hidden: boolean } };
  block: { req: W & { target: ReportTarget; position?: PositionEvidence }; res: { blockId: string } };  // post targets: ≥ preview (position or participant)
  blocks: { req: {}; res: { blocks: BlockEntry[] } };
  unblock: { req: { blockId: string }; res: { blockId: string } };
  requestChat: { req: Onsite & { postId: string; greeting: string }; res: ChatMeta };
  respondChat: { req: W & { chatId: string; accept: boolean }; res: ChatMeta };
  cancelChat: { req: W & { chatId: string }; res: ChatMeta };
  chats: { req: {}; res: { chats: ChatMeta[] } };
  chat: { req: { chatId: string }; res: { chat: ChatMeta; messages: ChatMessage[] } };
  sendChat: { req: W & { chatId: string; text: string }; res: ChatMessage };
  destroyChat: { req: W & { chatId: string }; res: ChatMeta };
  entitlements: { req: {}; res: { chatCredits: number; mock: true } };
  demoSettings: { req: {}; res: DemoSettings };                            // demo* = mock-only; real backend -> INVALID_ACTION
  demoUpdateSettings: { req: Partial<Omit<DemoSettings, 'anchor' | 'anchorSource'>>; res: DemoSettings };
  demoReanchor: { req: { center: GeoPoint }; res: DemoSettings };
  demoReset: { req: {}; res: { reset: true } };
  demoGrantCredits: { req: {}; res: { chatCredits: number; mock: true } };
  demoAccounts: { req: {}; res: { accounts: { method: AuthMethod; label: string; current: boolean }[] } };
  demoIntro: { req: {}; res: { postId: string } };
};
export type CommentReceipt = { id: string; postId: string; createdAt: number; participated: true };
export type ApiAction = keyof ApiActions;
export type LiudaApi = { [K in ApiAction]: (req: ApiActions[K]['req']) => Promise<ApiActions[K]['res']> };
export type ApiErrorCode = 'AUTH_REQUIRED' | 'INVITE_REQUIRED' | 'INVITE_INVALID' | 'FORBIDDEN' | 'INVALID_ACTION'
  | 'INVALID_INPUT' | 'INVALID_LOCATION' | 'LOCATION_REQUIRED' | 'STALE_LOCATION' | 'WEAK_LOCATION' | 'NOT_ONSITE'
  | 'PRESENCE_EXPIRED' | 'REQUEST_CONFLICT' | 'TOO_FAST' | 'POST_MISSING' | 'POST_LIMIT' | 'THREAD_FULL'
  | 'PARTICIPATION_REQUIRED' | 'CONTENT_REJECTED' | 'PHOTO_SIZE' | 'PHOTO_FORMAT' | 'PHOTO_EXPIRED' | 'PHOTO_MISSING'
  | 'BLOCKED' | 'CHAT_MISSING' | 'CHAT_STATE' | 'NO_ENTITLEMENT' | 'NETWORK' | 'SERVICE_UNAVAILABLE';
export type ApiEnvelope<T> = { ok: true; data: T; serverTime: number }
  | { ok: false; error: { code: ApiErrorCode; message: string }; serverTime: number };
export type Transport = (action: ApiAction, payload: unknown, token: string | null) => Promise<ApiEnvelope<unknown>>;
