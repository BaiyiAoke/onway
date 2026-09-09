$ErrorActionPreference = 'Stop'
$onwayRoot = Split-Path -Parent $PSScriptRoot

# 优先独立 JDK 21；新版 Studio 可能自带 Gradle 8 不兼容的 JDK 25。
# 仅设置当前构建进程，不覆盖系统 Java 配置。
if (-not $env:JAVA_HOME) {
  $onwayJdk = Get-ChildItem (Join-Path $env:USERPROFILE '.jdks') -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if ($onwayJdk) { $env:JAVA_HOME = $onwayJdk.FullName }
  else {
    $onwayStudioJdk = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
    if (Test-Path -LiteralPath $onwayStudioJdk) { $env:JAVA_HOME = $onwayStudioJdk }
  }
}
if (-not $env:ANDROID_HOME) {
  $onwaySdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path -LiteralPath $onwaySdk) { $env:ANDROID_HOME = $onwaySdk }
}
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath "$env:JAVA_HOME\bin\java.exe")) { throw '未找到 JDK，请安装 Android Studio 或配置 JAVA_HOME。' }
$onwayJavaRelease = Join-Path $env:JAVA_HOME 'release'
if (-not (Test-Path -LiteralPath $onwayJavaRelease) -or -not ((Get-Content -LiteralPath $onwayJavaRelease -Raw) -match 'JAVA_VERSION="21\.')) {
  throw '此工程固定使用 JDK 21，请设置 JAVA_HOME 指向 JDK 21；不要使用新版 Studio 自带的 JDK 25。'
}
if (-not $env:ANDROID_HOME -or -not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw '未找到 Android SDK，请通过 SDK Manager 安装或配置 ANDROID_HOME。' }

Push-Location (Join-Path $onwayRoot 'android')
try {
  & .\gradlew.bat --no-daemon --max-workers=4 '-Dorg.gradle.internal.http.socketTimeout=60000' '-Dorg.gradle.internal.http.connectionTimeout=20000' :app:assembleDebug
  if ($LASTEXITCODE -ne 0) { throw "Android 构建失败，退出码 $LASTEXITCODE" }
} finally { Pop-Location }

$onwayArtifactDir = Join-Path $onwayRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $onwayArtifactDir | Out-Null
Copy-Item -LiteralPath (Join-Path $onwayRoot 'android\app\build\outputs\apk\debug\app-debug.apk') -Destination (Join-Path $onwayArtifactDir 'onway-debug.apk')
Write-Output "APK: $onwayArtifactDir\onway-debug.apk"
