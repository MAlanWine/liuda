const api = require('../../services/api')
const preferences = require('../../services/preferences')
Page({
  data:{ inviteCode:'', configured:false, busy:false, message:'' },
  onShow() { this.setData({ configured:api.configured() }) },
  input(event) { this.setData({ inviteCode:event.detail.value }) },
  async join() {
    if (this.data.busy || !this.data.inviteCode.trim()) return
    this.setData({ busy:true, message:'' })
    try {
      await api.join(this.data.inviteCode.trim())
      this.setData({ inviteCode:'' })
      getApp().globalData.mode = 'live'; getApp().globalData.view = 'map'
      preferences.save('live','map')
      wx.showToast({ title:'已加入试用' })
      wx.switchTab({ url:'/pages/explore/index' })
    } catch (error) { this.setData({ message:error.message || '暂未加入，请稍后重试。' }) }
    finally { this.setData({ busy:false }) }
  },
  back() { wx.navigateBack({ fail:() => wx.switchTab({ url:'/pages/explore/index' }) }) }
})
