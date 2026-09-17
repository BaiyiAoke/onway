# 架构说明

## 模块边界

- `src/app`：Hash 路由、导航、平台交互和 Provider 装配。
- `src/features`：今天、地图、计划、地点页面，以及共享的行程工具栏和地点编辑表单。
- `src/components`：编辑面板、删除确认、Android 返回处理注册表与错误边界。
- `src/services/travel`：旅行类型、纯数据操作、日期辅助方法、TravelRepository 和 React Context。
- `src/services/storage`：异步 LocalStore 契约及 Web／Android 适配器。
- `src/services/routes`：高德分段服务、OSRM 适配器、路线缓存、交通确认与共享状态。
- `src/services/amap`：搜索、逆地理编码、算路共用的高德调度与错误处理。
- `src/features/routes`：每日摘要、分段结果、地图图例和高德按钮。
- `src/services/navigation`：Android 高德导航 URI 与原生启动器。
- `src/data`：带公开资料来源链接的示例地点，不读取 TREK 用户数据。
- `src/styles`：共享 CSS 变量与基础样式；功能样式由 CSS Modules 管理。
- `android`：Capacitor 原生工程；构建输出、机器路径和同步后的 Web 资源不入库。

## 本地数据与保存流程

`LocalStore.initialize/get/set` 全部异步，值采用字符串。Web 数据库为 `onway-local`，Android 数据库文件为 `onwaySQLite.db`。两端都保留 v1 `entries` 键值表；SQLite 打开连接前通过 `addUpgradeStatement` 显式注册建表迁移，以参数化 SQL 写入。

| 键                 | 用途                                                          |
| ------------------ | ------------------------------------------------------------- |
| `demo.travel-note` | v0.1 延续的独立个人备注，UI 改名但存储键不变                  |
| `travel.workspace` | 全部行程、地点库、城市、交通记录、分类及当前行程 ID 的文档 v4 |
| `routes.cache`     | 分段候选及兼容旧整日路线，独立文档 v2                         |

个人备注初始化只在键不存在时插入默认内容，已有备注（包括空字符串）不会被覆盖。首次读不到旅行文档时返回空工作区，不自动写入示例；用户在计划页点击示例按钮后，才创建包含新 ID 的可编辑副本。

旅行文档使用独立的 `schemaVersion: 4`，与数据库表版本分离。`Trip` 包含名称、可空出发日期、有序 `TripDay[]` 和未安排地点；`TripDay` 包含稳定 ID 与有序地点；`TripPlace` 包含稳定 ID、名称、备注、WGS84 坐标和可选来源链接。当前行程 ID 保存在文档中；“全部／未安排／第 N 天”的筛选是共享界面状态，切换行程或删除所选天后回到全部。

一次旅行操作流程：

1. 页面提交 `TravelAction`；纯数据函数在工作区副本上创建、修改、移动、排序或删除。
2. `TravelRepository` 串行执行操作，校验持久化快照未被其他页面更改，校验新文档后整体写入一个键。
3. 仅在写入成功后更新仓库快照，Context 再发布新的工作区给各页面；失败时保留原已保存快照，表单保留输入并显示错误。

文档读取会校验 JSON、版本、ID 唯一性、日期、坐标与当前行程引用。损坏或不支持的文档会提示错误并保留原始数据，不以空工作区覆盖，也不降级到内存存储。后续文档迁移必须在 `migrateWorkspaceDocument` 中显式增加版本分支；若确需升级表结构，再分别使用 Dexie 新版本和 SQLite 增量迁移，不删除旧库重建。

Web 写入使用 `navigator.locks`（环境支持时）包住读取、比较、写入，避免两个标签同时通过旧快照检查。检测到其他页面写入后，当前操作拒绝保存并提示重新加载，不自动覆盖或合并。编辑面板提供具体错误原因与保留草稿的重新读取入口；重新读取会保持正在编辑的行程，若它已被其他页面删除则保留输入并要求关闭面板后读取，不自动重建。没有 Web Locks 的环境仍有单实例队列和旧快照检查，但不能保证两个标签完全同时写入时无竞争，建议只使用一个编辑标签。Context 的更新只同步当前应用实例内的页面，不是跨标签自动推送。

地点在一个行程内只属于某一天或未安排；跨组移动保留 ID，追加到目标列表末尾，同组编辑保留原位置。删除一天时将其地点依序移到未安排末尾，至少保留一天；删除行程不影响其他行程或独立个人备注。日期按本地日历日取“今天”，日期加减使用 UTC 日历运算避免夏令时偏移；修改出发日期不移动或删除地点。

## 地图与编辑交互

MapLibre GL JS 在地图路由中按需加载，使用 OpenFreeMap Positron 并保留地图署名。无行程时引导创建，无地点时展示中国范围，不主动读取设备位置。

地图实例生命周期与组件挂载、重试相关；旅行数据和筛选变化只更新标记，不反复创建地图。已有标记的点击与底图空白点击分别处理：标记打开地点详情，空白位置生成临时标记并打开新增表单。地图保存分组默认沿用当前筛选天，全部或未安排视图默认放入未安排。重新选点携带原草稿，保存后才替换坐标；取消不会写入新增地点。

底图或瓦片报错、断网或初始化超时会显示错误与重试入口；重试释放旧实例后创建，离开页面时清理实例、标记、观察器与监听器。地点列表独立于地图加载状态，地图失败仍可编辑已有地点名称、备注、所属天与顺序；地图选点需要可用底图；手动输入坐标可离线新增和修改位置。

编辑面板在手机底部显示、桌面以弹窗显示。Android 返回由注册表按最上层优先处理，编辑面板遇到未保存修改先确认是否放弃，地图重新选点也可取消；无上层交互时再执行页面返回或退出。个人备注保留独立手动保存及浏览器离开提醒；主导航和 Android 返回会先确认未保存修改，保存进行中会拦截离开。页内快捷链接、主导航和浏览器后退统一经过导航保护，确认后继续原目标；系统强制结束进程无法拦截。

## 旧整日路线与外部导航（兼容层）

`RouteService.calculateDrivingRoute` 接收有序 WGS84 地点和可选 AbortSignal，返回 GeoJSON LineString（经度在前）、距离米数、时长秒数、逐段结果、来源和计算时间。`OsrmRouteService` 使用 FOSSGIS HTTPS 驾车端点，关闭备选与优化，`radiuses` 为每点 1000 米。校验返回几何、指标、吸附距离、途经点数量和分段完整性，不以直线或虚构时间兜底。

全应用共用一个请求队列：请求串行、开始间隔至少 1 秒、单次 20 秒超时；不自动重试。旧整日入口仍仅手动触发；v0.6 分段适配器也复用此队列，允许已保存变更触发。Android WebView 的 User-Agent 附加 Onway 版本和项目地址；Web 保留浏览器 UA。规则依据：[FOSSGIS 使用要求](https://routing.openstreetmap.de/about.html)、[OSRM Route API](https://project-osrm.org/docs/v5.24.0/api/#route-service)。限速针对当前应用实例，多标签不共享请求队列。

`RouteCacheRepository` 通过同一个 LocalStore 写入独立 `routes.cache`，当前采用 `schemaVersion: 2`，保留旧条目数组并新增 segments。每个条目含行程 ID、天 ID、输入指纹和 RouteResult。只保留该天最近一次成功结果；保存时读取最新缓存并合并，串行写入，有 Web Locks 时加跨标签锁；下一次成功保存时清理已删除行程／天的条目。不更改旅行工作区、数据库表版本或旧备注。解析失败及未知版本不自动覆盖，保留显式版本校验入口。

输入指纹包含服务标识、道路吸附策略版本、有序地点 ID 与 WGS84 坐标。日期、名称和备注不参与匹配。页面始终按当前天的输入重新匹配，因此增删、移动、排序、重新选点后不能把旧缓存当有效路线；未安排不计算，少于两点不显示旧指标。调整回完全相同的输入时，可重新匹配原缓存。

`RouteController` 通过 React Context + useSyncExternalStore 共享状态，TravelProvider 继续管理旅行数据。它在工作区更新时取消过期任务，接收响应和保存前再次核对输入；即使底层响应晚到也不会展示为当前路线。写入期间输入改变时，已写入的旧指纹也不会匹配新地点。缓存写入失败保留带“未保存”标记的新结果，用户可以只重试保存。重新算路失败时保留并明确标注上次仍匹配的估算。读取失败独立提示，旅行编辑仍可继续。

地图用独立 GeoJSON source 和线图层更新路线，颜色按天区分；“全部”只合并各天的独立 feature，不拼接跨天几何。“未安排”清空线路。地点或缓存更新不重建地图；加载失败但 source 已存在时仍清除失效线路。范围适配按钮同时包含地点与路线几何，避免道路绕行被裁切。

Android 导航封装在 `src/services/navigation/amap.ts`：仅使用已保存地点，通过稳定版 `@capacitor/app-launcher` 8.0.1 查询 `com.autonavi.minimap` 并打开官方 `androidamap://navi`。Manifest 声明包名和 scheme 的 queries；不申请定位权限，不嵌入高德 SDK。WGS84 传 `dev=1` 由高德转换，名称 URL 编码，来源为 Onway；`style=2` 保留 URI 必填项，实际偏好以当前高德设置为准。依据：[高德参数](https://lbs.amap.com/api/amap-mobile/guide/android/navigation)、[App Launcher v8](https://capacitorjs.com/docs/apis/app-launcher)。

高德从当前位置导航到单个目的地，路线可与 OSRM 估算不同。未安装／启动失败时留在 Onway 提示，Web 不显示客户端导航入口。

## 平台与构建

Capacitor `webDir` 指向 `dist`，不配置 `server.url`；Hash 路由适用于浏览器和 APK 本地资源。Android 最低 API 31、编译／目标 API 36，v0.6.0 `versionCode` 为 7，包名仍为 `app.onway.personal`。

APK 内置页面和本地存储能力，断网可管理已有数据；底图、瓦片与字体在线加载。Web 没有 Service Worker，不承诺离线冷启动。当前支持本地文件互导，不引入后端、账号、云同步、定位或离线地图下载。

MapLibre 6 Worker 通过 Vite 的 `?worker&url` 显式打包并使用 ES 模块格式，缺少此配置可能导致生产页面只有标记而没有底图。地图引擎分块约 1 MB，会产生超过 500 kB 的构建提示；该分块按地图路由延迟加载，不为了消除提示拆散引擎内部模块。

`package.json` 将 Capacitor CLI 间接依赖 `xcode` 的 `uuid` 覆盖到兼容其 `v4` 调用的 11.x；该覆盖仅影响构建工具，升级 Capacitor 时需复核。Android 对 SQLite 插件间接引入的 `security-crypto` 预发布依赖统一解析为稳定版 1.1.0，依据：[AndroidX 官方稳定版记录](https://developer.android.google.cn/jetpack/androidx/versions/stable-channel#july_31_2025)。

视觉使用自行编写的样式与 CSS 风景插画，不复制 TREK 源码、品牌或图片。

## v0.4 地点库、坐标与搜索

v0.4 引入旅行文档 schemaVersion 2（当前由 v0.6 升级至 v4）：原 trips / activeTripId 保留，新增 libraryPlaces 与 categories。TripPlace 增加 address、categoryId、source（osm 或 amap 的稳定来源 ID）、libraryPlaceId。最后一项仅供重复提示，不参与同步。copyToTrip 与 collectPlace 深复制并创建新 ID；删除库地点不清理行程副本。删除自定义分类则在同一工作区写入内清除所有分类引用。

v0.4 的 migrateWorkspaceDocument 将 v1 克隆为 v2（当前读取 v1／v2／v3 均迁移至 v4），保留原行程，新增空地点库和固定分类。读取不改磁盘，下一次成功操作才整体保存；失败保留原始文档。数据库表版本与旧备注、路线缓存不变。

PlaceEditor 共用于库与行程，PlaceComposer 负责搜索、手动输入和独立地图选点的草稿交接。坐标通过 gcoord 1.0.7 在本地从 GCJ-02 转为 WGS84，已有数据再次编辑使用 WGS84，重新选点清除旧位置来源。默认分类为空，预置分类不允许编辑或删除。

PlacesPage 不依赖 activeTrip。库中地点列表支持名称／地址和分类过滤；PointMap 按需加载，标记变化不创建新底图，离开及重试清理实例。原 MapPage 的行程点选与路线层保留。

搜索分层：

- service.ts 选择设备已保存供应商，配置键 search.provider.v1（provider / amapKey），不在请求失败时自动切换。
- nominatim.ts 提供公共手动搜索，HTTPS 可配置端点 search.settings.v1；search.cache.v1 含最近 50 查询、24 小时有效期与上次请求开始时间。全实例队列加可用时 Web Locks，开始间隔至少 1.1 秒、15 秒超时、可取消、无自动重试。
- amap.ts 调用官方 v3/place/text，offset 10 / page 1，校验状态码与结果，GCJ-02 转换并保存来源。search.amap-cache.v1 独立缓存 50 查询／24 小时，不包含 Key 或 API 请求 URL。Key 校验及配额错误直接显示。
- SearchPanel 显式提交，不做自动补全；搜索串行，草稿编辑取消后保留原结果；配置写入失败保留输入。默认 Key 通过被 Git 忽略的 .env.local 私有构建变量预置，按用户要求进入构建资源；设备设置优先，可修改、切换服务和恢复默认。真实 Key 不提交仓库。SearchPanel 支持页面内搜索框，PlacesPage 直接展示地图及次要坐标按钮。公共 Nominatim 的总应用流量限制仍需在未来分发前评估。

v0.4 当时未改变路线指纹、数据格式和计算行为；名称、分类、备注、地址不会使路线失效。DayRouteSummary 只收起说明性文案，保存失败、过期与计算失败仍明显显示。RouteAttribution 在今天／计划／地图各显示一次，底图署名保留。

## v0.5 备份与原子恢复

- services/backup/model.ts：格式版本 1、20 MB 上限、业务字段白名单、现有工作区校验与迁移。只导出已保存数据，不包含 Key、设备设置或缓存。
- BackupRepository：单次 readBatch 获取一致快照；预览不写入。确认时重新校验并以预览原始值作条件，writeBatch 同一事务写入 travel.workspace、demo.travel-note、空 routes.cache 和 backup.restore-epoch。
- AtomicLocalStore 扩展原 LocalStore，不改变 v1 数据库结构。Web 用 Dexie 事务；Android 用 SQLite 显式事务，所有读写共用同一连接队列。失败回滚，未回退逐键写入。
- travel、routes 和个人备注保存使用事务内条件比较及恢复代次，旧页面或旧路线响应不能覆盖恢复结果。恢复前取消当前路线请求，成功后重建 TravelProvider / RoutesProvider，不进行网页冷刷新。
- BackupPage：顶部入口、文件校验错误、数量预览、导出现有数据、覆盖确认与取消。进行文件操作或恢复时阻止导航与系统返回；恢复失败保留选中的文件并允许重新读取预览。
- Web 用 File 与 Blob 下载，不把“发起下载”误报为实际保存成功。Android 的 BackupFilesPlugin 使用 ACTION_CREATE_DOCUMENT / ACTION_OPEN_DOCUMENT 和 UTF-8 流读写，不申请外部存储权限。读取超过 20 MB 时停止，文件 I/O 在独立线程执行。

参考：[Android 文件访问](https://developer.android.com/training/data-storage/shared/documents-files)、[Capacitor Android 插件](https://capacitorjs.com/docs/plugins/android)、[Dexie 事务](<https://dexie.org/docs/Dexie/Dexie.transaction()>)。

## v0.6 分段交通

### 数据与身份

旅行文档 v4 兼容 v1／v2／v3，读取只内存迁移；数据库表版本仍为 1。Trip.transport 按 dayId、from.id、to.id 表示有方向的相邻关系，未配置默认自驾／高德。地点和端点快照包含可选 citycode、adcode、cityName。修改坐标清除城市元数据，名称、备注、分类不影响输入签名。

关系消失后记录的 dayId 置 null，保留端点快照、原配置、选定方案和车次。坐标或日期变化时标记 needsReview。行程级“待关联交通”支持查看、重新关联及确认删除；正式记录不会随候选刷新丢失。已选方案保存规范化指标、步骤、真实几何、来源时间和原查询指纹；显式核对后保存 confirmedFingerprint，原查询指纹仍保留。手动车次与航班分别保存 train / flight 字段，含完整的北京时间 ISO 时间；跨午夜以时间差计时，按出发天统计，不生成跨天连接。

备份外层版本仍为 1，白名单扩展城市、交通配置、已选方案、车次及待关联记录，过滤供应商原始字段。Key、候选、城市缓存不导出。恢复仍同一事务替换工作区／备注、清空 routes.cache 并更新恢复代次；过期草稿及旧任务不能写回。

### 服务与任务

AmapSegmentService.calculateSegment 接收两端、交通模式、来源、策略与出发时间，返回统一米／秒指标及步骤。高德使用 v5 driving、walking、transit/integrated，show_fields=cost,polyline。内部持久化与地图均为 WGS84，边界经 gcoord 转换 GCJ-02。OSRM 保留 calculateDrivingRoute，并用两个点适配分段请求。

公共交通策略 0／7／2 分别为推荐／地铁优先／少换乘，明确传入两端城市和日期时间。铁路结果用于建议展示，不提供票务。没有几何的步骤保留文字；公交同一乘车段的多个 busline 视为备选，不重复拼接或累加。CityResolver 按坐标逆地理编码，缓存到 amap.city.*，再通过受事务及快照保护的工作区操作保存城市信息；取消或恢复后的晚到响应不写回旅行数据。

AmapQueue 被关键词搜索、城市识别、分段路线共享：间隔至少 550ms，最多两个在途，同输入合并，每个订阅者独立取消，全部取消中止底层请求。网络单次 20 秒超时。瞬时 QPS／限流错误延迟 2 秒重试一次；日配额、余额、Key／授权错误不重试。OSRM 使用原有独立串行队列，至少 1 秒间隔，不自动重试。

SegmentController 监听保存后的当前行程变化，600ms 合并受影响路段；首次读入、切换行程／页面及恢复不全量查询。保存期间延后调度。查询前后与缓存写入前核对端点和条件，并校验恢复代次。城市元数据的自身写入不取消当前任务；用户重新核对日期后可以继续自动查询。关键词搜索仍由按钮手动触发。

缓存签名包含有方向的端点 ID／坐标、服务接口版本、方式、城市、策略和出发条件；“现在出发”另含 5 分钟桶。高德驾车／公交 TTL 5 分钟，步行／OSRM 24 小时。强制刷新跳过有效缓存；失败保留匹配的结果；计算成功但写盘失败独立标记，可只重试写盘。

### 共享呈现

segmentView 是今天、计划、地图共用的匹配及汇总入口。首次公交结果可预览首条推荐；选中后冻结正式方案，候选更新不替换它。失效选择和未核对时间不参与汇总，只有重新选择或明确确认原方案后恢复；火车未知距离单独注明。汇总使用方案整体耗时，不再加内部步行／换乘时长。

routes.cache v1 读取迁移为 v2，entries 保存旧整日结果，segments 保存新版候选。输入匹配、全部自驾且没有新版分段结果时显示旧版估算；其几何不强拆分，也不与新版重复相加。地图按天配色、按方式线型，只画服务实际提供的连续几何。

新交通面板复用 EditPanel、ConfirmDialog、语义色和基础控件。Android 返回先处理顶层面板及未保存确认。“地图服务设置”共用设备上的高德 Web 服务 Key，路线来源独立于搜索供应商。

依据：[高德路径规划 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute)、[高德错误码](https://lbs.amap.com/api/webservice/guide/tools/info)、[FOSSGIS 使用要求](https://routing.openstreetmap.de/about.html)。

## v0.6 体验调整与文档 v4

- v1／v2／v3 先按各自规则校验，再在内存中迁移到 v4。原四项公共分类保持，新增机场／车站；同名自定义分类升级为内置并保留 ID，新增分类 ID 避让已有实体。旧交通保留分类和引用，不猜测具体类型。下一次成功保存才写入 v4，SQLite／IndexedDB 表版本不变。
- TransportMode 增加 flight，flight 与 train 独立保存，二者均不发起路线请求。用户切换类型时可复用端点、号码、时间、备注，原记录不删除；校验、白名单、待关联、日期核对与全天汇总同步覆盖。
- savePlace / copyToTrip 的可选 afterPlaceId 仅控制新地点插入位置；指定目标必须属于目标分组且仍存在，否则拒绝保存。编辑已有地点不移动顺序。地点库连续加入通过最新工作区识别新副本 ID 后推进插入位置。
- PlanDaySummary 只读完整当天交通状态；折叠不计算路线，未完成、失败、待确认与距离未知仍可见。计划默认阅读，排序日期控件在整理状态显示。桌面日期下拉与前后切换、手机日期条共用 group。
- useSessionView 将日期展开、收藏关键词与分类放在 sessionStorage；列表/网格仍沿用 LocalStore 的 ui.places.view。展示状态均不进旅行文档或备份。
- GuardedLink / GuardedNavLink 与 BackHandler 传递待继续的导航；NoteEditor 确认后才执行原目标，保存失败保留输入。planReturn 只携带 tripId、dayId、placeId，返回后读取当前文档定位地点；地图本身按目标所属天展示。普通页面滚动按会话保存，明确地点锚点优先。
