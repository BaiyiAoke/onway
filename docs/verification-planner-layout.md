# 计划页布局调整验证

日期：2026-09-18。本轮在已实现的编排功能上调整布局；未提交 Git，版本仍为 0.6.0／versionCode 7，无数据迁移。

## 完成内容

- 将行程切换、日期与地点数量、行程操作、添加入口合成一条顶部工具栏；创建行程移到行程切换选项。手机编辑行程移入更多菜单。
- 日期导航、追加一天、展开／收起、撤销回到左侧；左栏最大 500px，地图使用余宽。仅计划页导航与正文使用同一左右边界。
- 地点名称使用 15px，地址和操作使用 13px。桌面插入按钮悬停／键盘聚焦显示；触屏通过地点菜单在前／后插入，保留拖动手柄。
- 地图范围开关放在画布内；添加面板覆盖地图一侧，保留原地图实例和锁定插入目标。Escape／关闭按钮可返回地图，手机继续沿用 EditPanel。
- 箭头只折叠；点击日期标题选中当天、展开并联动地图。当前日边框及标识明确；折叠不写入文档、不查询路线。
- 全天摘要突出地点数和交通耗时；待确认、失败、未知距离与上次估算继续可见。原拖拽、撤销、缓存和交通保存逻辑保留。
- 加载提示改为地图角落状态；失败提示居中，保留原 20 秒超时和重试规则。

## 自动及浏览器检查

- npm run check 通过：TypeScript、ESLint、32 个测试文件／221 项测试、生产构建。
- npm run format:check、git diff --check：通过。
- 浏览器隔离 Edge Chromium：编排交互 30 项、触摸模拟 12 项、本轮布局专项 12 项。模拟搜索及布局底图；用户个人行程未修改。
- 360／390／768／1024／1398px 无页面或卡片控件横向越界；1398／1024px 地图顶部约 191px，底部在 950px 高视口内。地点名称实际计算字号 15px。
- 专项覆盖折叠不选日、标题同步日期和地图、添加面板保留地图实例、窄侧面板地点库边界、Escape 关闭、手机编辑行程和返回。
- 实网 OpenFreeMap 底图成功进入 ready；47 个样式、瓦片和字体响应均成功，无失败请求、无页面异常。本次未复现截图中的持续加载，不能据此认定原网络问题已消除。
- 新增、移动、撤销、折叠、布局切换没有自动算路。高德实网及 Android 真机不在本次浏览器结果内。

[截图对比与测量结果](../artifacts/planner/layout-pass/index.html)。脚本和截图为本地忽略产物，位于 artifacts/planner/layout-pass。

## 安装包与设备验证

- npm run android:debug 构建成功；APK 的 23 个 Web 资源与当前 dist 逐项 SHA-256 匹配。
- APK：artifacts/onway-debug.apk，21,263,802 字节。
- SHA-256：F9C779580A77722612A85B702F67FCA0C5582CFAAB946EB931D90FA0E2A90587。
- 包名 app.onway.personal；versionName 0.6.0、versionCode 7；最低 API 31、目标 API 36。
- 详细资源校验：artifacts/planner/layout-pass/apk-verification.json。

安装与真机验证由用户完成，沿用[编排验收清单](verification-planner.md#待用户安装后完成的真机验收)。

## 本轮修改文件

- src/features/plan/PlanPage.tsx：工具栏、日期操作、地图覆盖面板。
- src/features/plan/Plan.module.css：布局、密度、字体、触屏及窄屏适配。
- src/features/plan/PlanDaySummary.tsx：摘要信息层级。
- src/features/plan/PlanPage.test.tsx：折叠与选日分离、创建及菜单入口回归。
- src/features/map/TravelMap.tsx：可选画布工具栏插槽。
- src/features/map/Map.module.css：画布工具与加载／错误状态。
- src/app/App.tsx、src/app/App.module.css：计划页专用导航宽度。
- docs/architecture.md、docs/file-inventory.md、docs/verification-planner.md、docs/verification-planner-layout.md：设计与验证记录。
