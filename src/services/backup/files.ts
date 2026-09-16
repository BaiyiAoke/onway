import { Capacitor, registerPlugin } from '@capacitor/core'
import { MAX_BACKUP_BYTES } from './model'
interface PickedFile {
  cancelled: boolean
  text?: string
  name?: string
}
interface BackupFilesPlugin {
  pick(): Promise<PickedFile>
  save(options: { name: string; text: string }): Promise<{ cancelled: boolean }>
}
const nativeFiles = registerPlugin<BackupFilesPlugin>('BackupFiles')
export async function pickBackupFile(): Promise<PickedFile> {
  if (Capacitor.getPlatform() === 'android') return nativeFiles.pick()
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json,text/plain'
    input.hidden = true
    const cleanup = () => input.remove()
    input.addEventListener(
      'cancel',
      () => {
        cleanup()
        resolve({ cancelled: true })
      },
      { once: true },
    )
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0]
        cleanup()
        if (!file) {
          resolve({ cancelled: true })
          return
        }
        if (file.size > MAX_BACKUP_BYTES) {
          reject(new Error('文件超过 20 MB。'))
          return
        }
        void file
          .text()
          .then(
            (text) => resolve({ cancelled: false, text, name: file.name }),
            reject,
          )
      },
      { once: true },
    )
    document.body.append(input)
    input.click()
  })
}
export async function saveBackupFile(
  name: string,
  text: string,
): Promise<'saved' | 'download' | 'cancelled'> {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    throw new Error('备份超过 20 MB。')
  if (Capacitor.getPlatform() === 'android')
    return (await nativeFiles.save({ name, text })).cancelled
      ? 'cancelled'
      : 'saved'
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json;charset=utf-8' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // 下载开始不等于用户已保存；保留对象 URL，避免较慢浏览器提前失效。
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'download'
}
