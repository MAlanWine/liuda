# 一起开发留答

## 第一次运行

1. 获得 GitHub 仓库访问权限后克隆仓库。
2. 安装微信开发者工具，用自己的微信登录。
3. 导入仓库根目录，即包含 `project.config.json` 的这一层，不是里面的 `miniprogram`。
4. 开发同一个小程序时，由项目负责人在微信公众平台添加相应的项目成员权限。GitHub 仓库权限与微信小程序权限分别管理。
5. 正常编译即可运行前端，不需要安装 npm 包或打包框架。先通过地图右上角“更多 → 切换体验模式”选择“演示街区”，体验地图气泡、留言、回复和草稿。
6. 参与真实定位与云端功能时，再由负责人安排试用邀请码及相应云开发权限。云环境变量保留在云控制台，伙伴无需拿到匿名密钥来运行前端。

仓库地址为 <https://github.com/Vans66660/liuda>。接受邀请并完成本机 GitHub 身份认证后：

```sh
git clone https://github.com/Vans66660/liuda.git
cd liuda
```

克隆出的 `liuda` 文件夹就是导入开发者工具时选择的项目根目录。

若使用自己的 AppID，位置接口、隐私配置与云环境都需要单独配置，参考 [定位与隐私](docs/location-privacy.md) 与 [云开发部署](docs/cloud-setup.md)。

## 代码位置

| 方向 | 主要目录 | 当前注意事项 |
| --- | --- | --- |
| 地图、气泡、底部卡片 | `miniprogram/pages/explore`、`miniprogram/utils/map-points.js` | 聚合仅改变显示，不修改真实地点坐标 |
| 现场发布、草稿、回复 | `miniprogram/pages/compose`、`miniprogram/pages/thread` | 原生输入框持有正在输入的文字，避免逐字回写 `value` |
| GPS 与距离权限 | `miniprogram/services/location.js`、`miniprogram/utils/geo.js` | 报告精度和位置时效参与到场判断 |
| 云端接口与审核 | `cloudfunctions/liudaApi` | 按微信调用身份校验，公开身份保持匿名 |
| 演示渲染与数据 | `miniprogram/utils/street.js`、`miniprogram/data/demo.js` | 虚构场景与真实地图数据保持独立 |
| 界面素材 | `miniprogram/assets` | 小程序直接使用这些资源；不要只提交生成脚本 |

## 分支与提交

- 从团队约定的默认分支拉取最新代码，为一项任务单独建分支，例如 `feature/campus-block`、`fix/input-lag`。
- 每个任务先开一个 Issue，写清目标、修改范围、完成的判定方式，再认领负责人。
- 一次 Pull Request 聚焦一个可描述的改动，说明改了什么、涉及哪些页面，以及实际验证了什么。尚未验证就明确写“未验证”。
- 界面改动附截图或短录屏。涉及定位时说明使用了演示模式、开发者工具模拟位置还是真机 GPS。
- 推送分支后发起 Pull Request，由另一名伙伴看过再合并。默认分支名称和保护规则以 GitHub 仓库实际设置为准。

例如：

```sh
git pull --ff-only
git switch -c feature/campus-block
# 完成这一项改动后，只暂存与这项工作相关的文件。
git add <相关文件>
git commit -m "feat: add campus block scene"
git push -u origin feature/campus-block
```

## 云端协作

前端源代码更新与云函数部署是两个步骤。合并云函数代码不会自动更新已部署环境。

试点期间先由一名约定的负责人部署共享云环境。改动接口时同步更新 `docs/backend-contract.md`，说明客户端与云函数的更新顺序。需要修改数据库集合、索引或权限时，先在 PR 中把具体变更写清楚。

当前不用 CI 自动部署，也没有已确认的自动化测试流程。不要把“代码已合并”“模拟器显示正常”“已部署”“手机确认可用”混写成同一种完成状态。

## 数据和素材

- `.private/`、真实 `.env`、个人 `project.private.config.json`、证书和密钥文件已通过 `.gitignore` 排除。现有 `.env.example` 只包含配置样例。
- 截图、录屏和 Issue 中不要放服务端凭据、邀请码或真实用户的精确位置与内容。需要复现时使用专门的演示内容。
- 真实校园场景素材记录来源、坐标系、采集日期、精度和使用条件；体积较大的原始模型先放团队约定的素材位置，Git 中提交来源说明及小程序实际加载的精简资源。
- 当前没有指定开源许可证；是否公开源代码以及采用什么许可证，由项目负责人另行决定。
