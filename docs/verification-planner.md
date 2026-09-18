# 计划页编排验证记录

后续布局见[布局调整验证](verification-planner-layout.md)，最新安装包与手机安装、数据恢复结果见[公共交通几何修复验证](verification-transit-geometry.md)。下面保留首轮编排实现的验收记录。

日期：2026-09-18。基线：a2fbbf879a81ce670ac072ac823ecbdf0c96f523。当前是基于已封板 v0.6.0 的工作区改动，未提交、未推送；应用仍为 0.6.0／versionCode 7，旅行文档 v4，不需要迁移。

## 完成范围

- 桌面左侧日期与地点编排、右侧地图／添加面板；窄屏原页展开地图。
- 初始展开当前编辑日，日期用于定位，保留其他天标题；支持全部展开和收起。
- 仅地点手柄可拖动，支持同日、跨日、未安排及键盘移动；方向按钮和日期分配使用相同原子移动动作。
- 最后一次成功移动可撤销，恢复完整交通关系；后续旅行文档编辑、切换行程、离页、恢复结束撤销。
- 地点间插入、锁定目标的连续搜索快速添加、收藏添加、重复提示与明确允许重复；手动输入和显式地图选点保留。
- 交通默认摘要，点击只展开当前一段快捷方式。路线查询规则、缓存与备份规则保持。

## 自动检查

- npm run check：类型、ESLint、32 个测试文件／219 项测试、生产构建全部通过。
- npm run format:check、git diff --check：通过。
- npm run android:debug：构建成功。逐项核对 APK 的 23 个 Web 资源与 dist，全部匹配。
- 保留已有 MapLibre 大分块与 Gradle flatDir 提示。

新增测试覆盖稳定位置、原位不写入、跨日与未安排、完整火车／飞机／公交快照恢复、失效插入锚点、排队过期动作、失败重试、恢复代次、独立缓存和异步采用撤销快照的竞态。计划页测试覆盖定位而非过滤、交通单段展开、重复方式不保存、连续插入和撤销失效。

## 浏览器验证

隔离 Edge Chromium 会话，虚构行程与收藏；底图使用本地模拟样式，搜索响应使用固定样例，没有访问或修改用户浏览器的旅行数据。这些结果不代表高德实网或 Android 真机验收。

- 桌面及响应式流程：30 项断言通过，实际路线请求 0 次；1 次模拟搜索请求。
- 触摸模拟：12 项断言通过，路线请求 0 次。
- 屏宽：360／390／768／1024／1398px。既检查页面 scrollWidth，也逐个检查日期卡片、面板内按钮和表单控件边界；全部通过。
- 0、1、3、5、20 地点与 20 天样例；长名称／地址／备注；N 个地点始终只有 N−1 段同日交通。
- 鼠标手柄拖动、跨天标题放置、悬停临时展开与 Esc 取消、键盘插入定位、按钮移动与撤销。
- 触摸长按 250ms 后移动、未达门槛不移动、手柄外正常滚动、手机地图关闭保留页面滚动、底图失败后本地调整。
- 连续搜索插入顺序、重复保护、城市信息保留、保存失败原地重试、左侧日期不改变添加目标、地图与地点互相定位、显式地图选点返回表单。
- 未观察到页面异常。保存失败、在线底图失败均为隔离会话中的故障注入。

浏览器脚本与结果（本地忽略产物）：

- artifacts/planner/review.cjs 与 artifacts/planner/mobile-review.cjs。
- artifacts/planner/review/results.json 与 mobile-results.json。
- artifacts/planner/review/ 下的五种屏宽、长行程、交通详情、手机地图与失败场景截图。

## 本轮 APK 与截图

- APK：artifacts/onway-debug.apk，21,263,008 字节。
- SHA-256：9EF58DD1F4D844F532DCA8DEC4FF9DB03B8CAA594411C821B0144FF01B60A854。
- 实际包名 app.onway.personal；versionName 0.6.0，versionCode 7；最低 API 31、目标 API 36。
- 核验详情：artifacts/planner/apk-verification.json。产物被 Git 忽略。
- [本地四页对比与场景截图](../artifacts/planner/review/index.html)。

## 待用户安装后完成的真机验收

1. 备份后覆盖安装，检查原行程、交通记录、地点库、备注和地图服务设置保留。
2. 实际手指长按拖动、跨日放置、边缘滚动、键盘输入与 Android 系统返回；取消拖动或关闭地图应留在当前计划。
3. 在线底图及真实高德搜索／交通查询；断网后继续编辑、移动和撤销。
4. Android 文件选择器导出／恢复备份，核对车次、航班、已选方案及待关联记录。

未执行设备安装、ADB 真机测试或新的线上接口测试。APK 构建与浏览器触摸模拟不能替代上述验收。

## 改动文件

- `README.md`
- `docs/architecture.md`
- `docs/file-inventory.md`
- `docs/verification-planner.md`
- `package-lock.json`
- `package.json`
- `src/components/EditPanel.module.css`
- `src/components/EditPanel.tsx`
- `src/features/map/MapPage.tsx`
- `src/features/map/TravelMap.tsx`
- `src/features/places/LibraryPicker.tsx`
- `src/features/places/PlaceComposer.tsx`
- `src/features/places/SearchPanel.tsx`
- `src/features/plan/Plan.module.css`
- `src/features/plan/PlanAddPanel.tsx`
- `src/features/plan/PlanDrag.tsx`
- `src/features/plan/PlanPage.test.tsx`
- `src/features/plan/PlanPage.tsx`
- `src/features/plan/TripEditor.tsx`
- `src/features/plan/usePlacement.test.tsx`
- `src/features/plan/usePlacement.ts`
- `src/features/routes/TransportSummary.tsx`
- `src/features/today/TodayPage.tsx`
- `src/features/travel/PlaceEditor.tsx`
- `src/services/routes/segmentController.test.ts`
- `src/services/travel/model.ts`
- `src/services/travel/placement.test.ts`
- `src/services/travel/repository.ts`
- `src/services/travel/types.ts`
