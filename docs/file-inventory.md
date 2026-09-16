# 工程文件清单

以下清单包含当前 v0.3 相对 v0.2 的改动，并保留 v0.2 历史清单，主分支为 main。构建产物、测试截图、node_modules 和机器路径均被忽略。

## v0.3 新增文件

- `docs/verification-v0.3.md`
- `src/features/routes/AmapButton.tsx`
- `src/features/routes/DayRouteSummary.test.tsx`
- `src/features/routes/DayRouteSummary.tsx`
- `src/features/routes/MapRouteOverview.tsx`
- `src/features/routes/Routes.module.css`
- `src/services/navigation/amap.test.tsx`
- `src/services/navigation/amap.ts`
- `src/services/routes/RoutesContext.tsx`
- `src/services/routes/controller.ts`
- `src/services/routes/model.ts`
- `src/services/routes/osrm.ts`
- `src/services/routes/repository.ts`
- `src/services/routes/routes.test.ts`
- `src/services/routes/view.ts`

## v0.3 修改文件

- `README.md`
- `android/app/build.gradle`
- `android/app/capacitor.build.gradle`
- `android/app/src/main/AndroidManifest.xml`
- `android/capacitor.settings.gradle`
- `capacitor.config.ts`
- `docs/android.md`
- `docs/architecture.md`
- `docs/file-inventory.md`
- `package-lock.json`
- `package.json`
- `src/app/App.tsx`
- `src/features/map/Map.module.css`
- `src/features/map/MapPage.test.tsx`
- `src/features/map/MapPage.tsx`
- `src/features/plan/PlanPage.test.tsx`
- `src/features/plan/PlanPage.tsx`
- `src/features/today/TodayPage.test.tsx`
- `src/features/today/TodayPage.tsx`
- `src/services/routes/types.ts`

## v0.2 新增文件

- `docs/verification-v0.2.md`
- `src/components/BackHandler.tsx`
- `src/components/EditPanel.module.css`
- `src/components/EditPanel.tsx`
- `src/features/plan/PlanPage.test.tsx`
- `src/features/today/TodayPage.test.tsx`
- `src/features/travel/PlaceEditor.test.tsx`
- `src/features/travel/PlaceEditor.tsx`
- `src/features/travel/Travel.module.css`
- `src/features/travel/TravelSaveFeedback.tsx`
- `src/features/travel/TravelToolbar.tsx`
- `src/services/travel/TravelContext.test.tsx`
- `src/services/travel/TravelContext.tsx`
- `src/services/travel/model.test.ts`
- `src/services/travel/model.ts`
- `src/services/travel/repository.test.ts`
- `src/services/travel/repository.ts`
- `src/services/travel/types.ts`

## v0.2 修改文件

- `README.md`
- `android/app/build.gradle`
- `android/variables.gradle`
- `docs/android.md`
- `docs/architecture.md`
- `docs/file-inventory.md`
- `package-lock.json`
- `package.json`
- `src/app/App.tsx`
- `src/features/map/Map.module.css`
- `src/features/map/MapPage.test.tsx`
- `src/features/map/MapPage.tsx`
- `src/features/plan/Plan.module.css`
- `src/features/plan/PlanPage.tsx`
- `src/features/today/NoteEditor.test.tsx`
- `src/features/today/NoteEditor.tsx`
- `src/features/today/Today.module.css`
- `src/features/today/TodayPage.tsx`
- `src/styles/global.css`

## 完整工程文件

- `.gitignore`
- `.prettierignore`
- `.prettierrc.json`
- `README.md`
- `android/.gitignore`
- `android/app/.gitignore`
- `android/app/build.gradle`
- `android/app/capacitor.build.gradle`
- `android/app/proguard-rules.pro`
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/app/onway/personal/MainActivity.java`
- `android/app/src/main/res/drawable-land-hdpi/splash.png`
- `android/app/src/main/res/drawable-land-mdpi/splash.png`
- `android/app/src/main/res/drawable-land-xhdpi/splash.png`
- `android/app/src/main/res/drawable-land-xxhdpi/splash.png`
- `android/app/src/main/res/drawable-land-xxxhdpi/splash.png`
- `android/app/src/main/res/drawable-port-hdpi/splash.png`
- `android/app/src/main/res/drawable-port-mdpi/splash.png`
- `android/app/src/main/res/drawable-port-xhdpi/splash.png`
- `android/app/src/main/res/drawable-port-xxhdpi/splash.png`
- `android/app/src/main/res/drawable-port-xxxhdpi/splash.png`
- `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`
- `android/app/src/main/res/drawable/ic_launcher_background.xml`
- `android/app/src/main/res/drawable/onway_icon.xml`
- `android/app/src/main/res/drawable/splash.png`
- `android/app/src/main/res/layout/activity_main.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png`
- `android/app/src/main/res/values/ic_launcher_background.xml`
- `android/app/src/main/res/values/strings.xml`
- `android/app/src/main/res/values/styles.xml`
- `android/app/src/main/res/xml/file_paths.xml`
- `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`
- `android/build.gradle`
- `android/capacitor.settings.gradle`
- `android/gradle.properties`
- `android/gradle/wrapper/gradle-wrapper.jar`
- `android/gradle/wrapper/gradle-wrapper.properties`
- `android/gradlew`
- `android/gradlew.bat`
- `android/settings.gradle`
- `android/variables.gradle`
- `capacitor.config.ts`
- `docs/android.md`
- `docs/architecture.md`
- `docs/file-inventory.md`
- `docs/verification-v0.2.md`
- `docs/verification-v0.3.md`
- `docs/verification.md`
- `eslint.config.js`
- `index.html`
- `package-lock.json`
- `package.json`
- `scripts/build-android.ps1`
- `src/app/App.module.css`
- `src/app/App.tsx`
- `src/components/BackHandler.tsx`
- `src/components/EditPanel.module.css`
- `src/components/EditPanel.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/data/demo.ts`
- `src/features/map/Map.module.css`
- `src/features/map/MapPage.test.tsx`
- `src/features/map/MapPage.tsx`
- `src/features/plan/Plan.module.css`
- `src/features/plan/PlanPage.test.tsx`
- `src/features/plan/PlanPage.tsx`
- `src/features/routes/AmapButton.tsx`
- `src/features/routes/DayRouteSummary.test.tsx`
- `src/features/routes/DayRouteSummary.tsx`
- `src/features/routes/MapRouteOverview.tsx`
- `src/features/routes/Routes.module.css`
- `src/features/today/NoteEditor.test.tsx`
- `src/features/today/NoteEditor.tsx`
- `src/features/today/Today.module.css`
- `src/features/today/TodayPage.test.tsx`
- `src/features/today/TodayPage.tsx`
- `src/features/travel/PlaceEditor.test.tsx`
- `src/features/travel/PlaceEditor.tsx`
- `src/features/travel/Travel.module.css`
- `src/features/travel/TravelSaveFeedback.tsx`
- `src/features/travel/TravelToolbar.tsx`
- `src/main.tsx`
- `src/services/navigation/amap.test.tsx`
- `src/services/navigation/amap.ts`
- `src/services/routes/RoutesContext.tsx`
- `src/services/routes/controller.ts`
- `src/services/routes/model.ts`
- `src/services/routes/osrm.ts`
- `src/services/routes/repository.ts`
- `src/services/routes/routes.test.ts`
- `src/services/routes/types.ts`
- `src/services/routes/view.ts`
- `src/services/storage/android.ts`
- `src/services/storage/index.ts`
- `src/services/storage/types.ts`
- `src/services/storage/web.test.ts`
- `src/services/storage/web.ts`
- `src/services/travel/TravelContext.test.tsx`
- `src/services/travel/TravelContext.tsx`
- `src/services/travel/model.test.ts`
- `src/services/travel/model.ts`
- `src/services/travel/repository.test.ts`
- `src/services/travel/repository.ts`
- `src/services/travel/types.ts`
- `src/styles/global.css`
- `src/test/setup.ts`
- `tsconfig.json`
- `vite.config.ts`

## v0.4 新增与主要改动

- `src/features/places/`：PlacesPage、PlaceComposer、PointMap、CategoryManager、CopyActions、SearchPanel 与 CSS Modules。
- `src/services/search/`：Nominatim、高德适配器、设备配置选择及测试。
- `src/services/travel/coordinates.ts`、`library.test.ts`：坐标来源转换与迁移／副本隔离测试。
- `src/services/travel/types.ts`、`model.ts`、`repository.ts`：工作区 v2、独立地点库、分类与显式迁移。
- `src/features/travel/PlaceEditor.tsx`：库／行程共用编辑、分类与坐标表单，保留失败重试。
- `src/app/App.tsx` 及 CSS：四个导航入口。
- 地图／计划／今天／路线组件：新地点入口、收藏动作、精简文案及折叠详情。
- `package.json`、锁文件、Capacitor 配置、Android app Gradle：gcoord 1.0.7、0.4.0 / code 4。
- README、架构、Android 指南、`verification-v0.4.md`：新功能及实际验收。

忽略目录中的 QA 脚本、截图、设备快照与 APK 不进入 Git。真实搜索 Key 未写入这些源码和文档。
