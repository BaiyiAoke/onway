# Android 开发与验收

## 工具链

安装 Google Android Studio 及其 SDK Manager。本工程使用 JDK 21，避免改变其他项目的 Java 环境。最新版 Studio 2026.1.4 自带 JDK 25，不适合本工程固定的 Gradle 8.14.3；已另装 Microsoft OpenJDK 21.0.12.1。Capacitor 采用 8.5.1，SQLite 插件采用兼容 Capacitor 8 的 8.1.1；精确依赖见 package-lock.json。

最低系统为 Android 10（API 29）。编译及目标 SDK 为 API 36，Build Tools 35.0.0（AGP 默认；本机另装有 36.0.0），AGP 8.13.0，Gradle 8.14.3。具体值以 `android/variables.gradle` 和仓库中的 Wrapper 为准。需要 SDK Platforms、Build Tools 和 Platform Tools，不需要为了真机测试安装模拟器。

默认查找路径：

- JDK：优先使用 `JAVA_HOME`，否则查找 `%USERPROFILE%\.jdks\jdk-21*`，再尝试 Studio 的 `jbr`。本机为 `C:\Users\DELL\.jdks\jdk-21.0.12.1+1`。
- SDK：`%LOCALAPPDATA%\Android\Sdk`

在 Android Studio 的 Gradle 设置中选择上述 JDK 21。使用自定义路径时，在当前 PowerShell 设置 `JAVA_HOME` 和 `ANDROID_HOME`。不要把机器绝对路径、签名证书或密码提交到仓库。

## 构建和安装

```powershell
npm ci
npm run android:debug
```

该命令依次构建 Web、同步 Capacitor、调用 Gradle `:app:assembleDebug`，最后复制为 `artifacts/onway-debug.apk`。首次构建需要网络下载工具链依赖；生成的 APK 不依赖电脑上的 Web 服务。

```powershell
npm run android:open
# 真机启用 USB 调试并在设备上确认后：
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r artifacts\onway-debug.apk
```

也可以将 APK 传到手机手动安装。包名 `app.onway.personal`，应用名“在途 Onway”，当前版本为 Debug，无正式发布签名。以后更新需保持包名与签名一致才可覆盖安装并保留数据。

## 真机验收步骤

1. 关闭电脑开发服务，启动 APK，切换今天／地图／计划。
2. 修改并保存示例备注，强制关闭应用后重开，确认数据保留。
3. 飞行模式下冷启动 APK，再次编辑、保存、重启读取。
4. 联网打开地图，检查底图、三个标记、弹窗和“显示全部地点”。
5. 切换页面数次，确认地图没有重叠画布；断网首次打开地图，错误提示和地点列表仍可见；联网后重试。
6. 打开软键盘，确认输入和保存按钮可滚动到达；检查系统栏、底部导航与手势区域。
7. Android 返回键从其他页面回到今天，在今天退出应用。

浏览器缩窄视口不等于真机验收，生成 APK 也不等于已验证 SQLite 原生插件。实际记录见 verification.md。
