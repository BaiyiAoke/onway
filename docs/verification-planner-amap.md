# 计划选日与高德底图验证

日期：2026-09-18。基于当前未提交的计划页编排实现；版本仍为 0.6.0／versionCode 7，无数据迁移。

## 本轮调整

- 日期标题区域（dayDrop）的空白、地点数及交通摘要均可点击选日；标题按钮仍支持键盘。内部折叠、添加按钮和拖动保持各自动作。
- 计划页嵌入地图和手机“计划地图”支持高德 JS API 2.0，使用浅色底图。地图右上角“底图设置”可切换高德／OpenFreeMap。
- 默认配置优先使用设备保存值；设备未覆盖时，有完整 JS API 构建配置就使用高德，否则继续 OpenFreeMap。只懒加载选中的底图引擎。
- 高德标记、弹窗编辑、缩放、当天／全程范围、地图选点及已有交通几何接入原计划操作。内部坐标仍为 WGS84，高德边界转换为 GCJ-02；铁路等缺少几何时不补画。
- 切日期、编辑地点和路线状态更新只替换覆盖物，保留底图实例。卸载销毁地图；SDK 晚到不创建废弃地图。加载超时、离线及失败提供重试。
- JS API 是页面单例。同配置复用加载请求；SDK 已开始加载后更换密钥明确提示重新打开页面，避免混用凭据或旧回调覆盖新配置。
- 独立地图页与地点库选点继续沿用原实现。搜索、路线、缓存及交通关联规则不变。

## 配置方式

入口：计划页 → 地图右上角“底图设置”（滑杆图标）→ 底图来源选择“高德地图”。填写高德控制台中 Web 端（JS API）Key 与对应的安全密钥 securityJsCode。原 Web 服务 Key 继续用于搜索和算路。

可在私有构建的 .env.local 预置 VITE_AMAP_JS_KEY、VITE_AMAP_JS_SECURITY_CODE；.env.example 仅记录空白示例。设备设置保存于 LocalStore 的 map.plan.settings.v1，不进入旅行文档或备份。

本机已检测到完整的 JS API 构建配置并完成实网验证；验证输出不含密钥或请求查询参数。

官方依据：[开发准备](https://lbs.amap.com/api/javascript-api-v2/prerequisites)、[安全密钥](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)、[JS API 加载](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load)。

## 检查结果

- npm run check 通过：TypeScript、ESLint、35 个测试文件／235 项测试、生产构建。
- npm run format:check、git diff --check 通过。
- 新增覆盖：日期整块点击；JS 配置与 Web 服务配置隔离；设备设置优先级、无效配置、保存失败重试；SDK 请求复用、失败重试、在途换密钥；坐标往返、有效几何、日期切换保留实例、弹窗、晚到 SDK 和卸载。
- 隔离 Edge Chromium：21 项设置、选日、地图交互及边界检查通过。SDK 响应桩仅用于交互检查，不作为底图实网依据。
- 1398／1024／768／390／360px 下配置面板、按钮无横向越界。设置关闭与手机两层面板 Escape 返回正常。
- 高德实网：8 项检查通过。初始 ready 状态约 1.1 秒，随后等待瓦片显示后截图确认；该时间不是完整瓦片耗时或长期性能保证。60 个外部响应；切换视图会取消旧瓦片，另观察到 2 次 SDK 日志上报超时，地图正常显示、无页面异常。
- 实网地点定位、弹窗编辑、日期切换、手机画布尺寸（350 × 707px）及关闭地图正常；实际路线查询次数为 0。
- 浏览器均使用独立测试存储，未修改用户行程。

脚本、截图和结果位于 artifacts/planner/amap-pass，包括 review.cjs、real-map.cjs、results.json、real-results.json。真实底图截图：real-amap-1398.png、real-amap-390.png；设置截图使用测试凭据且密码字段不回显内容。

## 本轮文件

- src/features/plan/PlanDrag.tsx、PlanPage.tsx、Plan.module.css、PlanPage.test.tsx：整块选日与计划底图入口。
- src/features/map/PlanMap.tsx：设备底图选择、设置面板和按需加载。
- src/features/map/AmapTravelMap.tsx、AmapTravelMap.test.tsx：高德可视化、地图交互和生命周期验证。
- src/features/map/TravelMap.tsx：导出共用地图属性类型，保留原底图实现。
- src/features/map/Map.module.css：底图设置、缩放按钮与弹窗样式。
- src/services/maps/settings.ts、settings.test.ts：设备配置和校验。
- src/services/maps/amap.ts、amap.test.ts：SDK 加载与坐标边界。
- package.json、package-lock.json：官方 JS API loader 1.0.1、类型包 0.0.15。
- .env.example、docs/architecture.md、docs/file-inventory.md、本文：配置说明和验证记录。

## 设备验收

npm run android:debug 构建通过，APK 的 26 个 Web 资源与 dist 逐项 SHA-256 匹配。安装包 artifacts/onway-debug.apk，21,281,179 字节；SHA-256：B9E78F6A63A6F9629682F1CB603EF63B6D88A03AD1FAF37A4798882D4AB0A82F。包名 app.onway.personal，版本 0.6.0／7，最低 API 31。

Android 安装与真机验证由用户完成。重点检查：覆盖安装保留行程、地图正常加载、点选位置准确、日期摘要可选日、设置保存、系统返回键依次关闭设置与地图、离线仍可编辑计划。
