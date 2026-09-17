# v0.6.0 四页布局与操作体验验证

后续分类、飞机、按天折叠与导航保护调整，见 [最新体验验证记录](experience-v0.6.md)。

记录时间：2026-09-17。本轮在现有 v0.6.0 实现上调整四页布局和已有信息呈现，没有提交 Git，没有修改旅行文档或备份格式。

## 完成的调整

- 总览改为单列，行程概览、当天或首日预览、个人备注依次排列。默认预览三个地点及其间交通；展开后展示完整一天，交通总计始终覆盖全天。查看完整计划会定位到预览当天。
- 地图改为工具区、全宽地图、交通汇总、沿途地点上下排列。桌面地图高 480px、手机 360px，地点清单自然增长。地点名称可定位地图并打开弹窗，编辑独立保留；地点库添加复用页内面板。
- 计划按地点 A、交通、地点 B 排列；快速交通方式与摘要在宽屏同行、窄屏换行。排序和日期分配按实际宽度布局，删除归入更多菜单，添加入口分组，待关联交通归入行程操作区。
- 地点库默认紧凑列表，提供列表与网格切换，地图默认收起。收藏筛选和搜索新地点分开，列表摘要收紧，网格按屏宽显示三、二或一列。
- 交通摘要新增紧凑呈现；公交步骤展示接口实际提供的耗时、距离和站点，手动车次展示保存的出发、到达时间及跨日提示。重复点选当前交通方式不触发查询。
- 设备视图偏好通过 LocalStore 的 ui.places.view 保存，读取失败回退列表；异步读取不会覆盖用户的新选择，连续保存按顺序完成。该偏好不进入旅行数据或备份。
- 验证时额外修复：关闭编辑面板后恢复原触发按钮焦点；窗口缩窄及日期筛选重新显示后，选中日期保持可见；地图服务设置保存后同步搜索来源标签，并取消原来源的未完成查询。

## 自动检查

- npm run check 通过：TypeScript、ESLint、27 个 Vitest 文件中的 160 项测试以及生产构建均通过。
- npm run format:check 通过。
- git diff --check 通过；Git 仅提示工作区换行符转换。
- 测试覆盖总览 0、1、3、5、20 个地点的折叠及 N−1 段对应关系、切换行程或日期后收起、正确日期跳转；地点库空结果、20 个地点的组合筛选、双视图编辑和添加、偏好读写异常及异步竞态；还覆盖地图失败后的编辑、页内添加、交通步骤指标与跨日车次、面板关闭和返回拦截。

## 浏览器布局与交互

使用全新浏览器上下文和隔离的测试行程，不读写用户现有浏览器数据。截图样例包含七天行程、首日五个地点、长名称和备注、公交方案与跨午夜手动车次，以及 18 个收藏地点。底图使用固定模拟样式；这轮验证不代表真实交通接口重测。

- 360、390、768、1024、1398px 下四页共 20 组前后截图，另有五种屏宽的地点网格截图。
- 所有宽度下页面没有横向溢出，排序按钮未越出卡片；也检查网格列数、地图展开后的有效尺寸和选中日期可见性。
- 26 项浏览器交互断言通过，包括键盘展开、Escape 关闭及焦点恢复、正确日期跳转、四段交通的位置、当前方式重复点选、偏好重新读取、地图定位弹窗和地点库加入后停留原页。
- 浏览器错误为 0，验证流程发出的路线请求为 0；展开、收起、视图切换、日期筛选没有触发算路。

以下尺寸来自同一套测试数据，单位为 px；真实行程长度和换行会影响高度。

| 检查项                        | 修改前 | 修改后 |
| ----------------------------- | -----: | -----: |
| 1398px 总览预览高度           |   1324 |    561 |
| 1398px 地图顶部位置           |    630 |    386 |
| 1398px 地图宽度               |    776 |   1096 |
| 1398px 地点库首条收藏顶部位置 |   1005 |    420 |
| 1398px 地点库单行高度         |    203 |     88 |
| 768 / 1024px 计划页横向溢出   |     13 |      0 |

[打开四页前后截图对比](http://127.0.0.1:5175/artifacts/v0.6/layout-review/index.html)，可切换页面和五种屏宽，地点库附独立网格截图。

本地验证产物：

- 对比页：artifacts/v0.6/layout-review/index.html。
- 测量与交互结果：artifacts/v0.6/layout-review/before-results.json、after-results.json。
- 浏览器脚本：artifacts/v0.6/layout-review.cjs；执行 node artifacts/v0.6/layout-review.cjs after 可检查当前代码。
- PNG 截图与以上结果位于同一目录。artifacts 目录按现有规则不进入 Git。

## Android 验证边界

本轮 adb devices -l 没有发现连接设备，因此尚未验证这次布局在 Android 真机上的软键盘、系统返回键及 WebView 渲染。组件测试验证了现有返回处理器的关闭、未保存确认和保存中拦截，但不能替代设备验证。

本轮没有重建或安装 APK，现有 artifacts/onway-debug.apk 仍是上一轮构建。原 verification-v0.6.md 中 2026-09-16 的真机结果属于此前实现，不作为本轮四页布局的真机验收结论。

建议接入 Android 12+ 设备后重点检查：搜索及车次编辑时的键盘遮挡；底部面板关闭后的返回位置；有未保存内容时的返回确认；地图展开尺寸和日期条横向滚动。

## 本轮改动文件

以下 28 个代码与测试文件相对于本轮开始时的暂存内容发生变化；此前已有的 v0.6.0 暂存文件保持原状态。本轮另新增本文，并在原验证记录增加入口。

- `src/components/EditPanel.test.tsx`
- `src/components/EditPanel.tsx`
- `src/features/map/Map.module.css`
- `src/features/map/MapPage.test.tsx`
- `src/features/map/MapPage.tsx`
- `src/features/places/LibraryPicker.module.css`
- `src/features/places/LibraryPicker.tsx`
- `src/features/places/Places.module.css`
- `src/features/places/PlacesPage.test.tsx`
- `src/features/places/PlacesPage.tsx`
- `src/features/places/SearchPanel.test.tsx`
- `src/features/places/SearchPanel.tsx`
- `src/features/places/usePlacesView.ts`
- `src/features/plan/Plan.module.css`
- `src/features/plan/PlanPage.test.tsx`
- `src/features/plan/PlanPage.tsx`
- `src/features/routes/MapRouteOverview.tsx`
- `src/features/routes/Routes.module.css`
- `src/features/routes/TransportEditor.tsx`
- `src/features/routes/TransportSummary.test.tsx`
- `src/features/routes/TransportSummary.tsx`
- `src/features/today/Today.module.css`
- `src/features/today/TodayPage.test.tsx`
- `src/features/today/TodayPage.tsx`
- `src/features/travel/Travel.module.css`
- `src/features/travel/TravelToolbar.test.tsx`
- `src/features/travel/TravelToolbar.tsx`
- `src/services/search/service.ts`
