import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.onway.personal',
  appName: '在途 Onway',
  webDir: 'dist',
  // 页面随 APK 打包，不连接开发服务器；Android 使用本机 SQLite。
  plugins: {
    CapacitorSQLite: { androidIsEncryption: false },
    SystemBars: { insetsHandling: 'css', style: 'LIGHT' },
  },
}
export default config
