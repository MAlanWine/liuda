// 生产能力统一从此接入。当前未配置任何生产服务，禁止真实写入。
// 到场判断、内容分层、匿名权限、支付和销毁必须由服务器执行。
function unavailable() {
  return Promise.reject(new Error('后端尚未接通，当前仅支持界面演示。'))
}

module.exports = {
  createPresenceSession: unavailable,
  getNearbySummaries: unavailable,
  readThread: unavailable,
  createPost: unavailable,
  createComment: unavailable,
  setLike: unavailable,
  requestPrivateChat: unavailable,
  acceptPrivateChat: unavailable,
  sendPrivateMessage: unavailable,
  destroyConversation: unavailable
}
