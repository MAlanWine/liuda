# 贸大校园底图资料与校核

资料核查日期：2026-10-27。对应 Issue #4。当前交付是参考数据与校核记录，小程序与云环境没有改动。

## 搜索结论

公开渠道找到了学校导览图和 OpenStreetMap 带坐标的校园数据。尚未找到可核实、可公开下载、注明坐标系的北京对外经济贸易大学校园 CAD/DWG、SHP、KML 或完整三维模型。这里的“未找到”不代表学校没有这些资料。

学校 2025-11-05 的[官方报道](https://news.uibe.edu.cn/info/1608/119948.htm)明确提到校内使用高精度 GIS 地图，但该页面没有提供数据下载，也没有开放复用授权。它可以作为后续向学校询问基础底图的线索，不能当成我们已经取得的数据。

检索覆盖：`site:uibe.edu.cn 校园 总平面图 坐标`、`对外经济贸易大学 校园 CAD dwg`、校名与 `filetype:dwg/dxf/shp/kml/kmz`、`geojson`、`BIM`、`数字孪生`、`倾斜摄影`、`模型下载` 等组合。已排除上海对外经贸大学及其他同名或近名院校的结果。

## 已确认的来源

| 来源 | 找到的内容 | 可以用来做什么 | 局限与使用条件 |
| --- | --- | --- | --- |
| [学校官网地图页](https://www.uibe.edu.cn/xywh/xxdt/index.htm) / [JPG 原图](https://www.uibe.edu.cn/images/2026-03/a7cd0ef3b8bf488fb23128c5b5048e42.jpg) | 1920×2715 校园导览图 | 地名、建筑与功能区的相对布局校对 | 未附坐标系、配准文件或测绘精度；URL 中 2026-03 不等于实测日期。学校保留版权，公开浏览不等于商业底图授权。 |
| [OSM 校园边界 way/412468627](https://www.openstreetmap.org/way/412468627) | 有经纬度的校园多边形 | 地理范围与初步几何参考 | 社区数据；精度未声明、未经现场核验。 |
| [OSM API 小范围原始数据](https://api.openstreetmap.org/api/0.6/map?bbox=116.4181,39.9758,116.4248,39.9821) | 边界、建筑、道路和运动设施 | 生成可编辑的矢量几何基础 | 导出数据遵循 ODbL，注明 © OpenStreetMap contributors；几何不完整、名称可能滞后。 |
| [学校 GIS 使用报道](https://news.uibe.edu.cn/info/1608/119948.htm) | 证实学校有内部 GIS 应用 | 未来申请学校基础图的线索 | 不是数据文件；本次未访问内部系统。 |

搜索还发现了学校的[新生手册 PDF](https://aeo.uibe.edu.cn/uploadfile/zjc_v3/front/default/upload_file_68242.pdf)和[国际教育学院地图 PDF](https://sie.uibe.edu.cn/en/docs/2024-03/ac09a0db9f804c1cabdf6806a4d008f6.pdf)。本次未对它们作逐页核验或将其中内容作为坐标依据。

## 已整理的文件

- `data/uibe-osm-wgs84.geojson`：67 个几何对象，包含校园边界 1、建筑轮廓 24、道路或步道段 38、运动设施图形 4。数量指本次导出对象，不代表校园实际设施总数；道路段也不代表 38 条独立道路。
- `data/source-manifest.json`：源地址、下载日期、原始文件 SHA-256、筛选方法、数量与坐标系。
- `landmarks.csv`：官方图、概念图、OSM 的地点对照与差异记录。未确认匹配的 OSM ID 留空。
- `control-points.csv`：首轮现场配准的 8 个候选点；坐标、精度、图像像素都留空，待同一地面点采集后填写。
- `audit.md`：概念图的问题、校核范围与下一步制作条件。
- `coverage.png`：由 GeoJSON 几何绘制的覆盖示意，便于看清现有资料的空缺，不是产品底图效果图。
- `references/official-campus.jpg` 与 `references/concept-v1.png`：本次校核所用的固定版本。前者为学校版权资料，后者为 AI 风格概念图，均未配准。

## 坐标和质量边界

GeoJSON 使用 WGS84，经纬度顺序为 `[longitude, latitude]`。没有把这些数值写进小程序。小程序当前 GPS/腾讯地图使用 GCJ-02，后续接入时必须统一坐标系，不能把 WGS84 数值原样当作 GCJ-02 使用。

导出只支持完整 way，保留节点坐标及源对象 ID。筛选规则是校园边界本身，以及顶点均值落在校园边界内的建筑、道路、运动设施 way；**没有做几何裁切**，不是全部校园要素清单。关系对象、孤立 POI、外部道路、树木和室内信息不在本次导出范围。源 API 返回的 way 均具有完整节点，但这不代表现实中的地图已经完整。

67 个对象均没有 `height` / `building:levels` 数据。建筑轮廓也不能说明入口、可通行路径、楼层和台阶位置。所有对象的精度字段为 null，现场核验状态为 false。不能据此宣称实现了 1:1 三维复刻或精细到场判定。

建筑名与官网存在差异，例如 OSM 的“国际教育大厦”与官网图的“国际交流大厦”。原始数据保持原名；对照表单独记录候选匹配，不静默改名，也不把一处名称相似当作定位验证。

## 下一步制作顺序

1. 以 OSM 几何为初稿，逐栋与官方图核对缺漏；内部名称需校方或现场确认。不能按导览图文字直接批量覆盖 OSM 公共数据。
2. 先做图书馆—书香广场周边的小范围样板。地面建筑落脚轮廓与路网按校准后的矢量绘制，屋顶、树木和材质独立做艺术表现，文字独立排版。
3. 收集 `control-points.csv` 中同一地面点的照片、重复定位样本、精度、时间和图像像素。开阔地点优先；不要拿建筑中心、屋顶中心或模糊的校门范围当控制点。
4. 配准后使用未参与拟合的检查点报告米级偏差，再决定能否叠加 GPS；不把整张插画的矩形边缘硬拉伸到校园经纬度边框。
5. 确认资料使用范围，精简资源、接入小程序，再由手机实地检查定位随动与性能。本次没有做到这一步。

## 复现数据整理

原始 API 响应保存在任务工作区 `tmp/uibe-map/sources/osm-uibe-area.osm`，未放进小程序包或 Git。重新下载时 OSM 数据可能发生变化，生成的几何和计数也会变化。使用 Python 3 标准库：

```sh
python3 scripts/import-uibe-osm.py /absolute/path/osm-uibe-area.osm docs/campus/uibe/data --retrieved-at YYYY-MM-DD
```

脚本只转换本地文件，不联网、不做坐标转换、不修改客户端。输出 JSON 已解析核查，数量与源文件已核对；未运行小程序、未做真机实地验证。

覆盖图可用 Pillow 和本机 CJK 字体重建，例如：

```sh
python3 scripts/build-uibe-coverage.py --font '/System/Library/Fonts/STHeiti Medium.ttc'
```

覆盖图使用校园纬度附近的局部等距近似投影，仅用于资料核查；生成图已打开检查。它保留 OSM 源名称，不能用作已校正的地名清单。

## 数据许可

OSM 导出及其来源字段：© OpenStreetMap contributors，依据 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)；参见 [OSM 版权与署名说明](https://www.openstreetmap.org/copyright)。本仓库的源代码许可不替代这些数据条件。官网图和 AI 概念图不属于这份 OSM 数据导出。
