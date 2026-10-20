const diagnostics = require('../../services/location-diagnostics')
const location = require('../../services/location')
function flag(value,yes,no) { return value === true ? yes : value === false ? no : '未取得状态' }
Page({
  data:{ loading:false, rows:[], failure:null, summary:'', copied:false },
  onShow() { this.refresh() },
  async refresh() {
    if (this.data.loading) return
    this.setData({ loading:true })
    try {
      const report = await diagnostics.collect()
      this._report = report
      const fail = report.lastFailure
      this.setData({ failure:fail, copied:false,
        summary:fail ? location.problem({ stage:fail.api,errMsg:fail.errMsg,code:fail.code }).message : '尚未记录定位失败。返回附近开启定位后，再查看这里。',
        rows:[
          { name:'当前 AppID',value:report.account.appId || '未取得' },
          { name:'运行版本',value:report.account.envVersion || '未取得' },
          { name:'诊断版本',value:report.build },
          { name:'微信 / 基础库',value:(report.runtime.version || '未知') + ' / ' + (report.runtime.SDKVersion || '未知') },
          { name:'手机系统定位',value:flag(report.system.locationEnabled,'已开启','已关闭') },
          { name:'系统对微信的定位许可',value:report.wechat.locationAuthorized || '未取得状态' },
          { name:'系统是否仅提供模糊位置',value:flag(report.wechat.locationReducedAccuracy,'是','否') },
          { name:'小程序位置授权',value:flag(report.scope.locationAuthorized,'已允许','已拒绝或已撤回') },
          { name:'隐私授权是否需再次同意',value:flag(report.privacy.needAuthorization,'需要再次同意','当前未要求再次同意') },
          { name:'当前隐私指引',value:report.privacy.privacyContractName || report.privacy.error || '未取得指引名称' }
        ] })
    } finally { this.setData({ loading:false }) }
  },
  copy() {
    if (!this._report) return
    wx.setClipboardData({ data:JSON.stringify(this._report,null,2),
      success:() => this.setData({ copied:true }),
      fail:() => wx.showToast({ title:'复制失败，可截图此页',icon:'none' }) })
  },
  back() { wx.navigateBack({ fail:() => wx.switchTab({ url:'/pages/explore/index' }) }) }
})
