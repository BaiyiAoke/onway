# Android 开发与验收

## 工具链与版本

本工程使用 Capacitor 8.5.1、兼容 Capacitor 8 的 SQLite 插件 8.1.1；精确依赖见 package-lock.json。v0.2 最低系统调整为 **Android 12（API 31）**，不安排 Android 10／11 等低版本兼容。目标验收设备为用户的 Android 12 手机。

| 项目                  | 工程配置                              |
| --------------------- | ------------------------------------- |
| 应用身份              | `app.onway.personal` / 在途 Onway     |
| 应用版本              | `0.2.0` / `versionCode 2`             |
| 最低 SDK              | 31                                    |
| 编译／目标 SDK        | 36 / 36                               |
| Build Tools           | 35.0.0（AGP 默认；本机另装有 36.0.0） |
| Android Gradle Plugin | 8.13.0                                |
| Gradle Wrapper        | 8.14.3                                |
| 构建 JDK              | 21                                    |

具体值以原生工程的变量、应用配置和仓库中的 Gradle Wrapper 为准。需要 SDK Platforms、Build Tools 和 Platform Tools，真机开发不要求安装模拟器。

本机已安装 Android Studio 2026.1.4，其内置 JDK 25 不用于本工程的 Gradle 8.14.3 构建；使用另装的 Microsoft OpenJDK 21.0.12.1。构建脚本会校验 JDK 21，只设置当前进程环境，不修改全局 Java 配置。

默认查找路径：

- JDK：优先使用 `JAVA_HOME`，否则查找 `%USERPROFILE%\.jdks\jdk-21*`，再尝试 Studio 的 `jbr`。本机为 `C:\Users\DELL\.jdks\jdk-21.0.12.1+1`。
- SDK：优先使用 `ANDROID_HOME`，否则查找 `%LOCALAPPDATA%\Android\Sdk`。

在 Android Studio 的 Gradle 设置中选择上述 JDK 21。使用自定义路径时，在当前 PowerShell 设置 `JAVA_HOME` 和 `ANDROID_HOME`。机器绝对路径、签名证书和密码不提交到仓库。

## 构建与覆盖安装

```powershell
npm ci
npm run android:debug
```

该命令依次构建 Web、同步 Capacitor、调用 Gradle `:app:assembleDebug`，最后复制为 `artifacts/onway-debug.apk`。首次构建需要网络下载工具链依赖；生成的 APK 内置页面与地图引擎，不依赖电脑上的开发服务。地图底图、瓦片和字体仍需网络。

```powershell
npm run android:open
# 手机启用 USB 调试并在设备上确认电脑授权后：
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r artifacts\onway-debug.apk
```

也可以将 APK 传到手机手动安装。覆盖更新需保持包名与签名一致，使用 `install -r`，不要先卸载旧版。v0.2 保留原生数据库 v1 和旧个人备注键；新增旅行数据作为独立文档写入，不把旧备注复制进某个行程。首次升级不会自动创建示例行程。

当前使用本机构建的 Debug 签名，没有正式发布签名或商店发布流程。换电脑后若 Debug 签名不同，无法直接覆盖旧安装，应先处理数据保留与签名问题，不通过卸载来绕过数据保留要求。

## v0.2 真机验收步骤

1. 保留旧版备注后覆盖安装，确认版本为 0.2.0；关闭电脑开发服务后启动应用，旧备注仍在。
2. 创建一个日期待定的多天行程，再创建另一个行程；切换行程，确认名称、天数与地点独立。
3. 联网进入地图，点击空白处新增并手动命名；分别保存到未安排和某一天。点击已有标记查看名称、编辑详情，并验证重新选点与取消操作。
4. 在计划页上移／下移地点、跨天移动、移回未安排；删除含地点的某一天，确认地点保留且日期重新编号。行程只剩一天时不能删除该天。
5. 修改出发日期，验证跨月日期显示；今天在行程期间显示当天安排，否则明确显示首日预览。
6. 修改并保存行程、地点和个人备注，强制停止后冷启动，确认内容、当前行程和地点顺序均保留。
7. 飞行模式下冷启动，编辑已有行程、地点备注与所属天，调整顺序并保存；再次重启核对数据。地图失败不应阻塞列表或页面切换。
8. 恢复网络，重试地图，确认底图与标记恢复；切换地图和其他页面，确认没有残留画布。
9. 在名称输入框和备注文本框打开软键盘，确认表单、保存按钮及底部安全区可用。系统返回优先处理编辑面板、未保存修改和重新选点，再回到今天，最后退出。

个人备注仍需主动保存；系统强制结束进程不能保证保留未保存的草稿。新增或重新选点需要可用底图，飞行模式重点验收已保存列表的管理。

浏览器缩窄视口不等于真机验收，APK 构建成功也不等于原生 SQLite 验收通过。本轮结果记录在 [v0.2 验证记录](verification-v0.2.md)；[v0.1 历史记录](verification.md)仅保留初始化版本当时的验证结果。
