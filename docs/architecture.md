# 架构说明

## 模块边界

- `src/app`：路由、导航和 Android 返回键。
- `src/features`：今天、地图、计划页面；只通过统一接口使用存储。
- `src/components`：共享错误边界。
- `src/data`：带来源链接的公开示例地点，不引用 TREK 私有数据。
- `src/services/storage`：LocalStore 契约及 Web、Android 适配器。
- `src/services/routes`：未来驾车路线服务的类型契约。
- `src/styles`：共享视觉变量与全局基础样式；功能样式由 CSS Modules 管理。
- `android`：Capacitor 原生工程；构建输出、机器路径和同步后的 Web 资源不入库。

## 本地数据

`LocalStore.initialize/get/set` 全部异步；值采用字符串。当前仅使用 `demo.travel-note`，不提前建完整行程表。

Web 数据库 `onway-local` 的版本 1 包含 `entries` 表，主键为 key；初始化事务只插入缺失的默认备注。Android 使用原生 SQLite 的同名键值表，连接版本为 1，并在打开连接前通过 addUpgradeStatement 注册 v1 建表迁移，使 user_version 确实写入 1；以参数化 SQL 写入，`INSERT OR IGNORE` 防止覆盖原备注。

后续迁移：Dexie 新增版本；Android 使用 SQLite 插件的 `addUpgradeStatement` 注册增量迁移，再提升连接版本。不得删除旧数据重建数据库来完成升级。

初始化失败允许重新读取；写入失败保留当前输入，不伪装保存成功，也不降级到内存存储。备注需要主动保存；页面切换前应保存。浏览器离开页面时对未保存修改进行提示，但移动系统强制结束进程无法拦截。

## 地图与路线

MapLibre GL JS 在地图路由中按需加载，底图使用 `https://tiles.openfreemap.org/styles/positron`，保持供应商署名。地图实例、ResizeObserver、标记与网络状态监听均随组件清理。

底图或瓦片报错显示重试；20 秒未完成初始化也显示错误；重试销毁旧实例再创建。地图失败不影响地点列表与备注。未申请定位权限，不连接搜索或算路公共服务。

`RouteService.calculateDrivingRoute` 接收按顺序排列的 WGS84 地点与可选 AbortSignal。未来实现必须校验至少两个合法点；返回 GeoJSON LineString（经度在前）、总距离米数、总时长秒数和按输入顺序对应的分段结果、来源与 ISO 格式计算时间。当前没有实现类或伪造结果。

## 平台边界

Capacitor `webDir` 指向 `dist`，不配置 `server.url`。Hash 路由同时适用于浏览器和 APK 本地资源。后端、账号、云同步、PWA、文件互导和离线底图下载均不在当前版本。

视觉是自行绘制的基础样式与 CSS 风景插画，不复制 TREK 源码、标识或图片。

## 构建注意事项

MapLibre 6 的 Worker 通过 Vite 的 `?worker&url` 显式打包，并使用 ES 模块格式。缺少此配置时，生产页面可能只有标记而没有底图。地图代码与 Worker 均随 APK 内置；瓦片、字体和样式仍需要网络。

地图引擎单个压缩后 JS 分块约 1 MB，构建会提示超过 500 kB。这部分已经按地图路由延迟加载，不影响今天页启动；暂不为消除提示而拆散引擎内部模块。

`package.json` 对 Capacitor CLI 间接依赖 `xcode` 的 `uuid` 覆盖到兼容其 `v4` 调用的 11.x，以消除旧版安全公告；已做 API 冒烟验证。此覆盖只影响构建工具，不进入 Android 运行逻辑。升级 Capacitor 时应重新检查是否仍需保留。
Android 对 SQLite 插件间接引入的 security-crypto 1.1.0-alpha06 统一解析为稳定版 1.1.0，避免预发布依赖。依据：[AndroidX 官方稳定版记录](https://developer.android.google.cn/jetpack/androidx/versions/stable-channel#july_31_2025)。
