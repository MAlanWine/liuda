const cloud = require('wx-server-sdk')
const D = require('./domain')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database({ throwOnNotFound:false }), _ = db.command
const C = { members:'liuda_members', scenes:'liuda_scenes', posts:'liuda_posts', comments:'liuda_comments',
  presence:'liuda_presence', ops:'liuda_ops', likes:'liuda_likes', photos:'liuda_photos', events:'liuda_events',threads:'liuda_threads' }
const ref = (source, collection, id) => source.collection(C[collection]).doc(id)
async function get(source, collection, id) {
  try {
    const result = await ref(source, collection, id).get()
    return Array.isArray(result.data) ? result.data[0] || null : result.data || null
  } catch (error) {
    // 只把明确的文档缺失当作空值；集合缺失、网络和权限错误继续抛出。
    const message = String(error.message || error.errMsg || '')
    if (!/collection/i.test(message) && /document.*(not exist|not found)|DOCUMENT_NOT_FOUND/i.test(message)) return null
    throw error
  }
}
const set = (source, collection, id, data) => ref(source, collection, id).set({ data })
const update = (source, collection, id, data) => ref(source, collection, id).update({ data })
function config() {
  const secret = process.env.LIUDA_ALIAS_SECRET || '', invite = process.env.LIUDA_INVITE_CODE || ''
  if (process.env.LIUDA_PILOT_ENABLED !== 'true') D.fail('PILOT_CLOSED', '联机试用暂未开放。')
  if (secret.length < 32 || invite.length < 16 || /^(REPLACE|YOUR_|CHANGE_)/i.test(secret) ||
      /^(REPLACE|YOUR_|CHANGE_)/i.test(invite) || !/^wx[0-9a-f]{16}$/.test(process.env.LIUDA_APP_ID || ''))
    D.fail('SERVER_NOT_READY', '联机服务还未配置完成。')
  return { secret, invite, appId: process.env.LIUDA_APP_ID }
}
async function member(uid) {
  const m = await get(db, 'members', uid)
  if (!m || m.disabled) D.fail('INVITE_REQUIRED', '请先输入试用邀请码。')
  return m
}
async function rate(tx, uid, now, type = 'write') {
  const m = await get(tx, 'members', uid)
  if (!m || !m.active || m.disabled) D.fail('INVITE_REQUIRED', '试用资格已失效。')
  const key = type + 'Limit', old = m[key] || {}, minute = Math.floor(now / 60000), day = Math.floor(now / 86400000)
  const n = old.minute === minute ? old.n : 0, daily = old.day === day ? old.daily : 0
  if (n >= (type === 'read' ? 60 : 15) || daily >= (type === 'read' ? 3000 : 150)) D.fail('TOO_FAST', '操作太频繁，稍后再试。')
  await update(tx, 'members', uid, { [key]: { minute, n:n + 1, day, daily:daily + 1 } })
}
async function readRate(uid) { await db.runTransaction(tx => rate(tx, uid, Date.now(), 'read')) }
async function activePost(source, id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{48}$/.test(id)) D.fail('POST_MISSING', '没有找到这条留话。')
  const post = await get(source, 'posts', id)
  if (!post || post.state !== 'active') D.fail('POST_MISSING', '这条留话已不可用。')
  return post
}
const threadKey = (uid,id) => D.hash(uid + ':' + id)
async function joined(source,uid,id) {
  const value = await get(source,'threads',threadKey(uid,id))
  return value && value.owner === uid && value.postId === id && value.state === 'active' ? value : null
}
async function grantThread(tx,uid,post,now,entry) {
  const key = threadKey(uid,post._id),old = await get(tx,'threads',key)
  if (old && old.state !== 'active') D.fail('FORBIDDEN','这段对话暂不可继续。')
  if (old) return
  await set(tx,'threads',key,{ owner:uid,postId:post._id,name:post.name,state:'active',joinedAt:now,entry })
}
async function ensureParticipation(uid,post) {
  if (await joined(db,uid,post._id)) return true
  // Upgrade old authors/repliers from trusted stored records, never from a
  // client-supplied flag, a read receipt, a like, or a scene/location match.
  let proof = null
  if (post.owner !== uid && !(post.replyParticipantIds || []).includes(uid)) {
    const result = await db.collection(C.comments).where({ postId:post._id,owner:uid,state:'active' }).limit(100).get()
    proof = result.data.find(item => item.entry !== 'continuation')
    if (!proof) return false
  }
  return db.runTransaction(async tx => {
    const p = await activePost(tx,post._id)
    if (await joined(tx,uid,p._id)) return true
    let verified = p.owner === uid || (p.replyParticipantIds || []).includes(uid)
    if (!verified && proof) {
      const c = await get(tx,'comments',proof._id)
      verified = !!c && c.owner === uid && c.postId === p._id && c.state === 'active' && c.entry !== 'continuation'
    }
    if (!verified) return false
    await grantThread(tx,uid,p,proof ? proof.createdAt : p.createdAt,'legacy')
    return true
  })
}
function readPosition(raw,participated) {
  if (participated) {
    if (!raw) return null
    try { return D.point(raw,Date.now()) } catch (error) { if (error.public) return null; throw error }
  }
  if (!raw) D.fail('LOCATION_REQUIRED','首次查看或加入这条对话需要定位；到场参与后可离场继续。')
  return D.point(raw,Date.now())
}
async function moderation(openid, content) {
  try {
    const result = await cloud.openapi.security.msgSecCheck({ openid, version:2, scene:2, content })
    if (result.result && result.result.suggest === 'pass') return
    D.fail('CONTENT_REJECTED', '内容暂时无法发布，请调整文字。')
  } catch (error) {
    if (error.public) throw error
    D.fail('REVIEW_UNAVAILABLE', '文字审核暂不可用，内容尚未发布。')
  }
}
async function assertTicket(tx, uid, ticketId, purpose, postId, position, now) {
  if (typeof ticketId !== 'string' || !/^[a-f0-9]{48}$/.test(ticketId)) D.fail('PRESENCE_EXPIRED', '请重新确认到场。')
  const t = await get(tx, 'presence', D.hash(ticketId))
  if (!t || t.owner !== uid || t.usedAt || t.expiresAt < now || t.purpose !== purpose || t.postId !== (postId || ''))
    D.fail('PRESENCE_EXPIRED', '到场凭证已失效，请重新操作。')
  if (D.distance(position, t.position) > 50) D.fail('NOT_ONSITE', '位置已发生较大变化，请重新操作。')
  return t
}
async function mutation(event, uid, position, purpose, postId, bodyHash, action, continuation = false) {
  const requestId = D.text(event.requestId, 80, '请求编号')
  if (!/^[a-zA-Z0-9-]{12,80}$/.test(requestId)) D.fail('INVALID_INPUT', '请求编号不正确。')
  const opId = D.hash(uid + ':' + purpose + ':' + requestId)
  if (!continuation) D.point(event.position, Date.now())
  return db.runTransaction(async tx => {
    const previous = await get(tx, 'ops', opId)
    if (previous) {
      if (previous.bodyHash !== bodyHash) D.fail('REQUEST_CONFLICT', '请求内容已经改变，请重新提交。')
      return previous.receipt
    }
    const now = Date.now()
    if (continuation) {
      await activePost(tx,postId)
      if (!await joined(tx,uid,postId)) D.fail('PARTICIPATION_REQUIRED','请先到场参与这条对话，之后可离场继续。')
    } else {
      D.point(event.position, now)
      await assertTicket(tx, uid, event.ticket, purpose, postId, position, now)
    }
    await rate(tx, uid, now)
    const receipt = await action(tx, now)
    if (!continuation) await update(tx, 'presence', D.hash(event.ticket), { usedAt:now })
    await set(tx, 'ops', opId, { owner:uid, bodyHash, receipt, createdAt:now })
    return receipt
  })
}
async function nearby(uid, position) {
  await readRate(uid)
  const result = await db.collection(C.posts).where({ state:'active', location:_.geoNear({
    geometry:new db.Geo.Point(position.longitude, position.latitude), minDistance:0, maxDistance:350 }) }).limit(50).get()
  const posts = result.data.map(post => D.summary(post, position, uid))
  if (posts.length) {
    const likes = await db.collection(C.likes).where({ owner:uid, active:true, postId:_.in(posts.map(post => post.id)) }).limit(50).get()
    const liked = new Set(likes.data.map(item => item.postId))
    posts.forEach(post => { post.liked = liked.has(post.id) })
  }
  // 不把作者内部身份、云文件 ID、未解锁全文或评论放入公开响应。
  return { posts, limited:result.data.length === 50 }
}
async function readThread(uid, id, secret, rawPosition) {
  await readRate(uid)
  const post = await activePost(db,id),participated = await ensureParticipation(uid,post)
  const value = D.summary(post,readPosition(rawPosition,participated),uid,participated)
  if (value.level !== 'full') return value
  const comments = await db.collection(C.comments).where({ postId:id, state:'active' }).orderBy('createdAt', 'asc').limit(100).get()
  value.comments = comments.data.map(item => ({ id:item._id, text:item.text, mine:item.owner === uid,
    name:item.owner === uid ? '你 · 匿名' : '路人 ' + D.aliasHash(secret, id + ':' + item.owner).slice(0, 4).toUpperCase(),
    entry:item.entry === 'continuation' ? 'continuation' : 'onsite',createdAt:item.createdAt }))
  value.previewComments = value.comments.slice(-2)
  const liked = await get(db, 'likes', D.hash(uid + ':' + id))
  value.liked = !!(liked && liked.active)
  return value
}
async function presence(event, uid, position) {
  if (!['post','comment','like','photo'].includes(event.purpose)) D.fail('INVALID_INPUT', '操作类型不正确。')
  const targeted = ['comment','like'].includes(event.purpose)
  if (targeted && (typeof event.postId !== 'string' || !/^[a-f0-9]{48}$/.test(event.postId))) D.fail('POST_MISSING', '没有找到这条留话。')
  const postId = targeted ? event.postId : ''
  if (postId) {
    const post = await activePost(db, postId)
    D.requireOnsite(position, post)
  } else D.requireOnsite(position, position)
  const token = D.random(), now = Date.now()
  await db.runTransaction(async tx => {
    await rate(tx, uid, now)
    await set(tx, 'presence', D.hash(token), { owner:uid, purpose:event.purpose, postId:postId || '',
      position, issuedAt:now, expiresAt:now + 30000, usedAt:0 })
  })
  return { ticket:token, expiresAt:now + 30000 }
}
async function createPost(event, uid, openid, position) {
  const content = D.text(event.text, 300, '留话'), name = D.text(event.name, 40, '地点名称')
  const sceneId = event.sceneId || '', photoId = event.photoId || ''
  if (sceneId && !/^[a-f0-9]{48}$/.test(sceneId)) D.fail('INVALID_INPUT', '地点不正确。')
  if (photoId && !/^[a-f0-9]{48}$/.test(photoId)) D.fail('INVALID_INPUT', '图片不正确。')
  D.requireOnsite(position, position)
  await assertTicket(db, uid, event.ticket, 'post', '', position, Date.now())
  await moderation(openid, name + '\n' + content)
  const postId = D.random(), newSceneId = sceneId || D.random()
  return mutation(event, uid, position, 'post', '', D.hash(JSON.stringify({ content, name, sceneId, photoId })), async (tx, now) => {
    let place = position, placeName = name
    if (sceneId) { const scene = await get(tx, 'scenes', sceneId); if (!scene || scene.state !== 'active') D.fail('PLACE_MISSING', '地点已不可用。'); D.requireOnsite(position, scene); place = scene; placeName = scene.name }
    D.requireOnsite(position, place)
    if (photoId) {
      const photo = await get(tx, 'photos', photoId)
      if (!photo || photo.owner !== uid || photo.state !== 'staged' || now - photo.createdAt > 600000) D.fail('PHOTO_EXPIRED', '图片已失效，请重新拍摄。')
      D.requireOnsite(position, photo.position)
      await update(tx, 'photos', photoId, { state:'attached', postId })
    }
    if (!sceneId) await set(tx, 'scenes', newSceneId, { owner:uid, name, latitude:position.latitude, longitude:position.longitude, state:'active', createdAt:now })
    await set(tx, 'posts', postId, { owner:uid, sceneId:newSceneId, name:placeName, text:content,
      teaser:content.slice(0,14) + '……', latitude:place.latitude, longitude:place.longitude,
      location:new db.Geo.Point(place.longitude, place.latitude), photoId, createdAt:now,
      state:'active', commentCount:0, likeCount:0,replyParticipantIds:[],lastEngagedAt:now })
    await grantThread(tx,uid,{ _id:postId,name:placeName },now,'post')
    return { id:postId, createdAt:now }
  })
}
async function comment(event, uid, openid, position) {
  const content = D.text(event.text, 300, '回复')
  const post = await activePost(db, event.postId)
  D.requireOnsite(position, post)
  await assertTicket(db, uid, event.ticket, 'comment', post._id, position, Date.now())
  await moderation(openid, content)
  const commentId = D.random()
  return mutation(event, uid, position, 'comment', post._id, D.hash(post._id + ':' + content), async (tx, now) => {
    const p = await activePost(tx, post._id); D.requireOnsite(position, p)
    await grantThread(tx,uid,p,now,'comment')
    return saveComment(tx,p,uid,content,commentId,now,'onsite')
  })
}
async function saveComment(tx,p,uid,content,id,now,entry) {
  if (p.commentCount >= 100) D.fail('THREAD_FULL','本轮试用每条留话最多 100 条回复。')
  await set(tx,'comments',id,{ postId:p._id,owner:uid,text:content,createdAt:now,state:'active',entry })
  const participants = Array.isArray(p.replyParticipantIds) ? p.replyParticipantIds.slice() : []
  const newParticipant = p.owner !== uid && !participants.includes(uid)
  if (newParticipant) participants.push(uid)
  const patch = { commentCount:p.commentCount+1,updatedAt:now,replyParticipantIds:participants,lastCommentAt:now,lastCommentOwner:uid }
  if (newParticipant) patch.lastEngagedAt = now
  await update(tx,'posts',p._id,patch)
  if (p.owner !== uid) await set(tx,'events',id,{ owner:p.owner,postId:p._id,name:p.name,type:'reply',createdAt:now })
  return { id,postId:p._id,createdAt:now,participated:true }
}
async function continueComment(event,uid,openid) {
  const content = D.text(event.text,300,'回复'),post = await activePost(db,event.postId)
  if (!await ensureParticipation(uid,post)) D.fail('PARTICIPATION_REQUIRED','请先到场参与这条对话，之后可离场继续。')
  await moderation(openid,content)
  const id = D.random()
  // Same idempotency namespace/body as an onsite reply; a transport retry that
  // crosses the onsite/continuation boundary must not create two comments.
  return mutation(event,uid,null,'comment',post._id,D.hash(post._id+':'+content),async (tx,now) => {
    const p = await activePost(tx,post._id)
    return saveComment(tx,p,uid,content,id,now,'continuation')
  },true)
}
async function like(event, uid, position) {
  if (typeof event.desired !== 'boolean') D.fail('INVALID_INPUT', '点赞状态不正确。')
  return mutation(event, uid, position, 'like', event.postId, D.hash(event.postId + ':' + event.desired), async (tx, now) => {
    const post = await activePost(tx, event.postId); D.requireOnsite(position, post)
    const id = D.hash(uid + ':' + post._id), old = await get(tx, 'likes', id), was = !!(old && old.active)
    if (was !== event.desired) {
      await set(tx, 'likes', id, { owner:uid, postId:post._id, active:event.desired, updatedAt:now })
      // Likes are already unique per member. Toggling a like does not reset age.
      await update(tx, 'posts', post._id, { likeCount:Math.max(0, post.likeCount + (event.desired ? 1 : -1)) })
    }
    return { id:post._id, liked:event.desired }
  })
}
async function uploadPhoto(event, uid, position) {
  if (typeof event.base64 !== 'string' || event.base64.length > 700000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(event.base64)) D.fail('PHOTO_SIZE', '图片过大或格式不正确。')
  D.requireOnsite(position, position)
  const buffer = Buffer.from(event.base64, 'base64'), contentType = D.mime(buffer)
  await assertTicket(db, uid, event.ticket, 'photo', '', position, Date.now())
  // 试用版仅在同步图片审核通过后入库；接口不可用时明确失败，不发布未审图片。
  try { const result = await cloud.openapi.security.imgSecCheck({ media:{ contentType, value:buffer } }); if (result.errCode !== 0) D.fail('CONTENT_REJECTED', '图片暂时无法发布。') }
  catch (error) { if (error.public) throw error; D.fail('REVIEW_UNAVAILABLE', '图片审核暂不可用，可以先只留文字。') }
  const id = D.random(), file = await cloud.uploadFile({ cloudPath:'liuda-private/' + uid + '/' + id + (contentType === 'image/png' ? '.png' : '.jpg'), fileContent:buffer })
  try {
    const receipt = await mutation(event, uid, position, 'photo', '', D.hash(event.base64), async (tx, now) => {
      await set(tx, 'photos', id, { owner:uid, fileId:file.fileID, position, state:'staged', postId:'', createdAt:now, contentType })
      return { photoId:id }
    })
    // 幂等重试应返回第一次上传的图片记录。
    if (receipt.photoId !== id) await cloud.deleteFile({ fileList:[file.fileID] }).catch(() => {})
    return receipt
  } catch (error) { await cloud.deleteFile({ fileList:[file.fileID] }).catch(() => {}); throw error }
}
async function photo(uid, postId, rawPosition) {
  await readRate(uid)
  const post = await activePost(db,postId),participated = await ensureParticipation(uid,post)
  const position = readPosition(rawPosition,participated)
  if (!participated) D.requireOnsite(position,post)
  if (!post.photoId) return { base64:'', contentType:'' }
  const value = await get(db, 'photos', post.photoId)
  if (!value || value.state !== 'attached' || value.postId !== postId) D.fail('PHOTO_MISSING', '图片暂不可用。')
  const file = await cloud.downloadFile({ fileID:value.fileId })
  return { base64:file.fileContent.toString('base64'), contentType:value.contentType }
}
async function removePost(event, uid) {
  const requestId = D.text(event.requestId,80,'请求编号'), now = Date.now()
  if (!/^[a-zA-Z0-9-]{12,80}$/.test(requestId)) D.fail('INVALID_INPUT','请求编号不正确。')
  const opId = D.hash(uid + ':delete:' + requestId), bodyHash = D.hash(event.postId)
  const result = await db.runTransaction(async tx => {
    const previous = await get(tx,'ops',opId)
    if (previous) { if (previous.bodyHash !== bodyHash) D.fail('REQUEST_CONFLICT','请求内容已经改变。'); return previous.receipt }
    await rate(tx,uid,now)
    const p = await activePost(tx,event.postId)
    if (p.owner !== uid) D.fail('FORBIDDEN', '只能删除自己的留话。')
    await update(tx, 'posts', p._id, { state:'deleted', deletedAt:now })
    if (p.photoId) await update(tx, 'photos', p.photoId, { state:'deleted' })
    const receipt = { id:p._id }
    await set(tx,'ops',opId,{ owner:uid,bodyHash,receipt,createdAt:now })
    return receipt
  })
  return result
}
async function mine(uid) {
  await readRate(uid)
  const result = await db.collection(C.posts).where({ owner:uid, state:'active' }).orderBy('createdAt','desc').limit(50).get()
  return { posts:result.data.map(p => ({ id:p._id, name:p.name, commentCount:p.commentCount, createdAt:p.createdAt, owned:true,participated:true })) }
}
async function conversationPosts(uid) {
  const [records,own,replies] = await Promise.all([
    db.collection(C.threads).where({ owner:uid,state:'active' }).orderBy('joinedAt','desc').limit(50).get(),
    db.collection(C.posts).where({ owner:uid,state:'active' }).orderBy('createdAt','desc').limit(50).get(),
    db.collection(C.comments).where({ owner:uid,state:'active' }).orderBy('createdAt','desc').limit(100).get()
  ])
  const ids = new Set(records.data.map(item => item.postId))
  replies.data.filter(item => item.entry !== 'continuation').forEach(item => ids.add(item.postId))
  own.data.forEach(item => ids.delete(item._id))
  const posts = own.data.slice(),remaining = Array.from(ids)
  for (let offset=0;offset<remaining.length;offset+=20) {
    const result = await db.collection(C.posts).where({ _id:_.in(remaining.slice(offset,offset+20)),state:'active' }).limit(20).get()
    posts.push(...result.data)
  }
  return { posts:posts.sort((a,b) => (b.lastCommentAt || b.createdAt)-(a.lastCommentAt || a.createdAt)).slice(0,50),own:own.data }
}
const conversationMetadata = (p,uid) => ({ id:p._id,name:p.name,owned:p.owner===uid,participated:true,
  commentCount:p.commentCount,createdAt:p.createdAt,updatedAt:p.lastCommentAt || p.createdAt })
async function conversations(uid) {
  await readRate(uid)
  return { threads:(await conversationPosts(uid)).posts.map(p => conversationMetadata(p,uid)) }
}
async function conversationEvents(uid,posts) {
  const result = await db.collection(C.events).where({ owner:uid }).orderBy('createdAt','desc').limit(20).get()
  const byPost = new Map(posts.map(p => [p._id,p])),events = new Map()
  result.data.forEach(e => { if (byPost.has(e.postId) && !events.has(e.postId)) events.set(e.postId,{ id:e._id,postId:e.postId,name:e.name,type:e.type,createdAt:e.createdAt }) })
  posts.forEach(p => {
    if (!p.lastCommentAt || p.lastCommentOwner === uid) return
    const previous = events.get(p._id)
    if (!previous || previous.createdAt < p.lastCommentAt) events.set(p._id,{ id:p._id+'-'+p.lastCommentAt,postId:p._id,name:p.name,type:'reply',createdAt:p.lastCommentAt })
  })
  return Array.from(events.values()).sort((a,b) => b.createdAt-a.createdAt).slice(0,20)
}
async function activity(uid) {
  await readRate(uid)
  return { events:await conversationEvents(uid,(await conversationPosts(uid)).posts) }
}
async function inbox(uid) {
  await readRate(uid)
  const data = await conversationPosts(uid)
  return { threads:data.posts.map(p => conversationMetadata(p,uid)),mine:data.own.map(p => conversationMetadata(p,uid)),
    events:await conversationEvents(uid,data.posts) }
}
exports.main = async event => {
  try {
    const settings = config(), ctx = cloud.getWXContext()
    if (!ctx.OPENID || ctx.APPID !== settings.appId) D.fail('AUTH_REQUIRED', '请从已配置的小程序打开。')
    const uid = D.aliasHash(settings.secret, ctx.OPENID), action = event && event.action
    if (action === 'join') {
      const now = Date.now()
      await db.runTransaction(async tx => {
        const old = await get(tx, 'members', uid)
        if (old && old.disabled) D.fail('FORBIDDEN', '当前试用资格已暂停。')
        if (old && old.active) return
        const attempts = old && old.joinMinute === Math.floor(now / 60000) ? old.attempts || 0 : 0
        if (attempts >= 5) D.fail('TOO_FAST', '尝试次数过多，请稍后再试。')
        await set(tx, 'members', uid, Object.assign({}, old || {}, { active:false, disabled:false, joinMinute:Math.floor(now / 60000), attempts:attempts + 1 }))
      })
      if (!D.equal(event.inviteCode || '', settings.invite)) D.fail('INVITE_INVALID', '邀请码不正确。')
      await update(db, 'members', uid, { active:true, joinedAt:now })
      return { ok:true, data:{ joined:true,protocol:2 }, serverTime:Date.now() }
    }
    const m = await member(uid)
    if (!m.active) D.fail('INVITE_REQUIRED', '请先加入试用。')
    let data
    if (action === 'status') data = { joined:true, protocol:2 }
    else if (action === 'mine') data = await mine(uid)
    else if (action === 'conversations') data = await conversations(uid)
    else if (action === 'inbox') data = await inbox(uid)
    else if (action === 'activity') data = await activity(uid)
    else if (action === 'delete') data = await removePost(event,uid)
    else if (action === 'thread') data = await readThread(uid,event.postId,settings.secret,event.position)
    else if (action === 'photo') data = await photo(uid,event.postId,event.position)
    else if (action === 'continueComment') data = await continueComment(event,uid,ctx.OPENID)
    else {
      const position = D.point(event.position, Date.now())
      switch (action) {
        case 'nearby': data = await nearby(uid, position); break
        case 'presence': data = await presence(event, uid, position); break
        case 'post': data = await createPost(event, uid, ctx.OPENID, position); break
        case 'comment': data = await comment(event, uid, ctx.OPENID, position); break
        case 'like': data = await like(event, uid, position); break
        case 'uploadPhoto': data = await uploadPhoto(event, uid, position); break
        default: D.fail('INVALID_ACTION', '暂不支持这项操作。')
      }
    }
    return { ok:true, data, serverTime:Date.now() }
  } catch (error) {
    if (!error.public) console.error('liudaApi failure', { code:error.code || 'INTERNAL' })
    const setupMissing = !error.public && /collection.*(?:not exist|not found)|index.*(?:not exist|not found|missing|required)/i.test(String(error.message || error.errMsg || ''))
    return { ok:false,error:{ code:error.public ? error.code : setupMissing ? 'DATABASE_UPGRADE_REQUIRED' : 'SERVICE_UNAVAILABLE',
      message:error.public ? error.message : setupMissing ? '离场续聊的数据库集合或索引尚未就绪，请按升级说明配置后重试。' : '联机服务暂不可用，请稍后重试。' },serverTime:Date.now() }
  }
}
