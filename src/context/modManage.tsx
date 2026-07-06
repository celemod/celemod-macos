import { callRemote } from '../utils'
import { useInstalledMods, useGamePath, useStorage, initGamePath, initModComments } from '../states'
import { useEffect } from 'react'
import { toast } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { useAlertDialog } from 'src/components/alert-dialog'

let lastGamePath = ''
export const createModManageContext = () => {
  const { t } = useTranslation()
  initModComments()

  const { setInstalledMods } = useInstalledMods()
  const [gamePath] = useGamePath()
  const st = useStorage()

  // Save game path to store when it changes
  useEffect(() => {
    if (!gamePath || !st.ready) return
    ;(async () => {
      await st.set('lastGamePath', gamePath)
      await st.save()
    })()
  }, [gamePath, st.ready])

  initGamePath()

  const alert = useAlertDialog()

  const ctx = {
    reloadMods: async () => {
      if (!gamePath) {
        console.warn('game path not set')
        throw new Error('game path not set')
      }
      const data = (await callRemote('get_installed_mods', gamePath + '/Mods')) as any[]
      setInstalledMods(data)
      return data
    },
    gamePath,
    modsPath: gamePath + '/Mods',
  }

  async function checkInvalidZipMods() {
    if (!gamePath) return
    try {
      const invalidFiles = (await callRemote(
        'get_invalid_zip_mod_files_cmd',
        gamePath + '/Mods',
      )) as string[]
      if (invalidFiles.length === 0) return

      alert({
        status: 'warning',
        title: t('发现无效 Mod 压缩包'),
        message: (
          <>
            <p>{t('以下文件不是有效的 zip，继续保留可能导致游戏崩溃：')}</p>
            <p>{invalidFiles.join(', ')}</p>
          </>
        ),
        cancelText: t('暂不处理'),
        okText: t('删除这些文件'),
        onOk: async () => {
          try {
            await callRemote('delete_mod_files', gamePath + '/Mods', invalidFiles)
            await ctx.reloadMods()
          } catch (e) {
            console.error('Failed to delete files:', e)
          }
        },
      })
    } catch (e) {
      console.error('Failed to check invalid zip mods:', e)
    }
  }

  // WHY THE FUCK useEffect doesn't trigger here
  if (lastGamePath !== gamePath) {
    lastGamePath = gamePath

    if (gamePath) {
      ;(async () => {
        try {
          const ver = (await callRemote('get_everest_version', gamePath)) as string
          if (ver && ver.length > 2) {
            const loadingId = toast(t('正在加载 Mod 列表，请稍等'), {
              isLoading: true,
            })
            try {
              await ctx.reloadMods()
              toast.close(loadingId)
              checkInvalidZipMods()
              const isUsingCache = await callRemote('is_using_cache')
              if (isUsingCache) {
                toast.warning(t('离线模式'), {
                  description: t('正在使用缓存的 Mod 数据，可能已过期或不完整'),
                })
              }
            } catch {
              toast.close(loadingId)
              toast.danger(t('加载 Mod 列表失败'), {
                description:
                  t('请检查游戏路径是否正确，或网络连接是否正常') + ', ' + t('部分功能将不可用'),
              })
            }
          }
        } catch (e) {
          console.error('Failed to check everest version:', e)
        }
      })()
    }
  }

  return ctx
}
