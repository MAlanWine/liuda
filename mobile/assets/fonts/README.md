# 登录页字体

品牌字使用 Noto Serif CJK SC Medium，界面文字使用 Noto Sans CJK SC Regular / Medium。只嵌入登录页固定文案的字形；字体子集内部名称重命名为 LiudaDisplay / LiudaInterfaceV2 / LiudaInterfaceMedium。完整许可保留在 OFL.txt，字体内部的版权及许可信息也保留。

来源为官方 https://github.com/notofonts/noto-cjk ，下载于 2026-11-06：

- Serif/OTF/SimplifiedChinese/NotoSerifCJKsc-Medium.otf
- Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
- Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Medium.otf

上游版权：

- serif-medium.otf: © 2017-2024 Adobe (http://www.adobe.com/).
- sans-regular.otf: © 2014-2021 Adobe (http://www.adobe.com/).
- sans-medium.otf: © 2014-2021 Adobe (http://www.adobe.com/).

再生成：安装 fonttools==4.60.2，将三个上游文件分别命名为 serif-medium.otf、sans-regular.otf、sans-medium.otf，然后运行 `python scripts/subset-auth-fonts.py <上游字体目录>`。脚本会检查字形覆盖并打印源文件 SHA256。新增登录页文案后需要重跑、完整重载 App；涉及新字形时递增字体家族版本，避免设备复用旧字库；不要将这份固定文案子集用于用户帖子。完整原始字库不进入仓库。

字体通过 expo-font 从本地加载；加载失败时保留系统字体，避免登录入口空白。
