Page({
  data: { text: '', photoPath: '' },
  onTextInput(event) { this.setData({ text: event.detail.value }) },
  capturePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (result) => this.setData({ photoPath: result.tempFiles[0].tempFilePath }),
      fail: (error) => {
        if (error.errMsg && error.errMsg.indexOf('cancel') !== -1) return
        wx.showModal({ title: '相机暂不可用', content: '请在手机预览中使用相机，并允许相机权限。照片不会上传。', showCancel: false })
      }
    })
  }
})
