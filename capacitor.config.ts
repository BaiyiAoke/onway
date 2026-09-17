import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.onway.personal',
  appName: '在途 Onway',
  webDir: 'dist',
  // 公共算路服务要求可识别客户端；原生 WebView 保留系统 UA 并附加应用来源。
  android: {
    appendUserAgent: ' Onway/0.6.0 (+https://github.com/BaiyiAoke/onway)',
  },
  // 页面随 APK 打包，不连接开发服务器；Android 使用本机 SQLite。
  plugins: {
    CapacitorSQLite: { androidIsEncryption: false },
    SystemBars: { insetsHandling: 'css', style: 'LIGHT' },
  },
}
export default config
