# v0.6.0 体验调整与兼容验证

本轮检查之后的最新构建、功能范围及设备验收状态，统一见 [v0.6.0 封板记录](release-v0.6.md)。以下保留体验调整完成时的记录。

日期：2026-09-17。本轮在已暂存的 v0.6.0 与上一轮布局修改基础上继续调整，未提交 Git，也未改动原暂存状态。

## 本轮实现

- 地点分类新增机场／车站。旧交通分类保留为“交通（待整理）”，不根据地点名称猜分。已有同名自定义分类沿用原 ID，行程、未安排和地点库的引用均保留。
- 交通方式独立显示火车和飞机，手动记录作为录入方式。航班保存号码、两端机场、北京时间的出发／到达时间和备注，支持跨日及距离未知；旧车次完整保留，主动切换类型时可继承字段并核对。
- 全部天数默认折叠，收起后仍显示地点数、已有交通时长和结果段数、待确认、失败或未保存状态；支持全部展开／收起，单日选择直接展开。展开状态只记当前会话。
- 桌面地图和计划使用日期下拉、上一天／下一天；手机保留日期条。计划默认阅读，“调整顺序与日期”显示原排序与日期控件，长备注按需展开。
- 当天末尾可继续添加，地点“更多”可在此后搜索、输入坐标或从地点库加入。连续插入按选择顺序推进，目标丢失拒绝保存；编辑已有地点不改变位置。
- 地点库行内显示已加入的日期，默认防重复，允许后可再次加入；底部显示本次加入数与完成。关键词、分类和普通页面滚动位置在会话内保留，列表／网格偏好仍通过 LocalStore 保存。
- 已保存交通方案和手动记录先展示，设置按需展开；保存并查询留在面板等待结果。新候选不会自动覆盖已确认方案。
- 备注在页内链接、主导航、浏览器后退和系统返回前统一保护，可保存并继续或放弃并继续。地图提供返回原日期计划的入口，并恢复原地点焦点；普通页面恢复滚动位置。

## 数据与备份

旅行文档升为 v4，v1／v2／v3 先按原规则校验，再只做内存迁移，下一次成功保存才落盘。备份外层仍为 v1，数据库表不变。航班、车次、公交选定方案和待关联信息完整进入白名单；Key、候选缓存和 UI 展示偏好不进入备份。

## 验证结果

- npm run check 通过：类型、ESLint、30 个测试文件的 203 项测试以及生产构建均通过。保留既有地图分块大于 500kB 的构建提示。
- npm run format:check、git diff --check 通过；Git 仅有 Windows 换行转换提示。
- 360／390／768／1024／1398px 下四页检查通过，同时检查页面横向溢出和卡片内控件越界。
- 隔离 Edge 的体验脚本 33 项断言通过，包含二十天折叠与直接选第 20 天、中途插入、详情优先展示、地图返回原日期及焦点、备注保存后继续、收藏筛选记忆与航班备份。流程没有路线请求和页面错误。
- 独立导航脚本 6 项实测通过，覆盖 hero 取消保留草稿、保存并继续、浏览器后退取消与重试、普通滚动 800→800、地图返回地点焦点。浏览器实测中发现并修复历史监听重注册和短页面提前钳制滚动的问题。
- 单元测试额外覆盖旧文档／旧备份迁移、分类冲突、航班跨午夜／离线／坏字段／待关联、保存失败与恢复冲突、连续插入及重复加入。

浏览器使用全新独立上下文与虚构行程，未操作用户真实行程。截图底图采用模拟样式，未访问路线服务；本轮结果不代替在线接口或真机验证。

## 截图与复现

[打开本轮与上轮截图对比](http://127.0.0.1:5175/artifacts/v0.6/experience-review/index.html)。对比使用隔离样例，本轮加入航班与分类示例；另附七天／二十天折叠和航班详情。

- artifacts/v0.6/experience-review.cjs：node 执行，生成五屏宽截图与 results.json。
- artifacts/v0.6/experience-review/results.json：33 项断言与每页边界测量。
- artifacts/v0.6/navigation-review.cjs、navigation-review-results.json：历史返回与滚动恢复实测。
- artifacts 属于现有 Git 忽略目录。前一轮 ui-review-v0.6.md 的截图和测试数字保留为历史记录，以本文为当前验收说明。

本轮未重建或安装 APK，Android 系统返回已进行组件回归，真机软键盘、WebView 布局及覆盖安装尚未验收；现有 APK 仍属于此前构建。

## 改动文件

以下是本轮代码与测试文件清单，另同步 README、architecture、file-inventory、验证记录入口和本文。

- src/app/App.tsx
- src/components/BackHandler.tsx
- src/components/GuardedNavigation.test.tsx
- src/components/GuardedNavigation.tsx
- src/components/usePageScroll.test.tsx
- src/components/usePageScroll.ts
- src/features/map/Map.module.css
- src/features/map/MapPage.test.tsx
- src/features/map/MapPage.tsx
- src/features/places/LibraryPicker.module.css
- src/features/places/LibraryPicker.test.tsx
- src/features/places/LibraryPicker.tsx
- src/features/places/PlaceComposer.tsx
- src/features/places/PlacesPage.test.tsx
- src/features/places/PlacesPage.tsx
- src/features/plan/Plan.module.css
- src/features/plan/PlanDaySummary.tsx
- src/features/plan/PlanPage.test.tsx
- src/features/plan/PlanPage.tsx
- src/features/routes/DayRouteSummary.test.tsx
- src/features/routes/Routes.module.css
- src/features/routes/TransportEditor.test.tsx
- src/features/routes/TransportEditor.tsx
- src/features/routes/TransportSummary.test.tsx
- src/features/routes/TransportSummary.tsx
- src/features/today/NoteEditor.test.tsx
- src/features/today/NoteEditor.tsx
- src/features/today/TodayPage.tsx
- src/features/travel/PlaceEditor.test.tsx
- src/features/travel/PlaceEditor.tsx
- src/features/travel/Travel.module.css
- src/features/travel/TravelToolbar.test.tsx
- src/features/travel/TravelToolbar.tsx
- src/features/travel/planReturn.ts
- src/features/travel/useSessionView.ts
- src/services/backup/backup.test.ts
- src/services/backup/model.ts
- src/services/routes/amap.ts
- src/services/routes/routes.test.ts
- src/services/routes/segmentController.test.ts
- src/services/routes/segmentController.ts
- src/services/routes/segmentView.ts
- src/services/routes/transport.test.ts
- src/services/routes/transport.ts
- src/services/routes/transportTypes.ts
- src/services/routes/transportValidation.ts
- src/services/travel/library.test.ts
- src/services/travel/model.test.ts
- src/services/travel/model.ts
- src/services/travel/repository.ts
- src/services/travel/types.ts
- src/test/transportFixtures.ts
