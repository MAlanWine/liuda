const privacy = require('../../services/privacy')
Component({
  data:{ visible:false, contractName:'小程序隐私保护指引', ready:false, notice:'' },
  lifetimes:{
    attached() {
      this._active = true
      this._unsubscribe = privacy.subscribe(pending => { this._pending = pending; this.update() })
    },
    detached() {
      if (this._unsubscribe) this._unsubscribe()
      if (this.data.visible) privacy.decline()
    }
  },
  pageLifetimes:{
    show() { this._reading = false; this._active = true; this.update() },
    hide() { this._active = false; if (this.data.visible && !this._reading) privacy.decline(); this.update() }
  },
  methods:{
    update() {
      const visible = !!(this._active && this._pending)
      if (visible === this.data.visible) return
      this.setData({ visible, ready:false, notice:'' })
      this.triggerEvent('visibilitychange',{ visible })
      if (!visible) return
      wx.getPrivacySetting({
        success:result => {
          if (!this.data.visible) return
          const name = result.privacyContractName
          this.setData({ contractName:name || '小程序隐私保护指引', ready:!!name,
            notice:name ? '' : '隐私指引暂未就绪，请联系发起人完成配置。' })
        },
        fail:() => { if (this.data.visible) this.setData({ notice:'暂时无法读取隐私指引，请稍后重试或联系发起人。' }) }
      })
    },
    openContract() {
      this._reading = true
      wx.openPrivacyContract({ fail:() => { this._reading = false; this.setData({ notice:'隐私指引打开失败，请稍后重试或联系发起人。' }) } })
    },
    agree(event) {
      // 仅由微信官方 open-type 的授权事件触发，不用普通 tap 冒充同意。
      if (this.data.ready) privacy.agree(event.currentTarget.id)
    },
    decline() { privacy.decline() },
    blockTouch() {}
  }
})
