# 在途 Onway

个人旅行控制台的初始化工程。Web 与 Android 使用同一套 React 界面，各自保存本地数据，不连接 TREK 或业务服务器。

## 开发

需要 Node.js 24、npm 11。

```powershell
npm ci
npm run dev
```

打开 http://127.0.0.1:5175/#/today 。端口固定，避免改变 IndexedDB 所属来源；localhost 与 127.0.0.1 也是不同的存储来源。

```powershell
npm run check
npm run format:check
npm run preview
npm run android:debug
```

## 当前能力

- 今天／地图／计划三个 Hash 路由，桌面顶部导航、手机底部导航。
- 示例城市地点及在线 OpenFreeMap 地图，支持标记弹窗、缩放与范围适配。
- 当前设备的示例旅行备注，手动保存后可跨刷新／应用重启读取。
- Web：Dexie / IndexedDB；Android：原生 SQLite。未登录、未同步、不读取设备定位。

示例地点采用公开城市中心的近似 WGS84 坐标，资料链接见计划页。仅用于界面验证，不是景区入口、推荐行程或导航目的地。道路路线、驾驶时间及距离尚未接入，接口已预留。

## 数据与离线

- 两端数据独立；文件互导和备份尚未实现，请勿作为唯一旅行资料存储。
- Web 数据位于当前浏览器来源的 `onway-local` IndexedDB，清除网站数据会删除它。
- APK 数据位于应用私有目录的 `onwaySQLite.db`，卸载或清除应用数据会删除它。
- APK 内置页面资源，断网仍能打开页面和保存备注；底图在线加载，不保证离线可用。
- Web 没有 Service Worker，不保证断网冷启动；保持页面打开后，存储操作不依赖网络。

## 文档

- [架构说明](docs/architecture.md)
- [Android 开发与验收](docs/android.md)
- [验证记录](docs/verification.md)
- [新增文件清单](docs/file-inventory.md)

源码仓库：[BaiyiAoke/onway](https://github.com/BaiyiAoke/onway)，主分支为 `main`。工程不包含发布密钥，Debug APK 只用于开发验收。
