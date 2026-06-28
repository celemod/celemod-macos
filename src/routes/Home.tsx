import { useState } from 'react'
import { GameSelector } from '../components/GameSelector'
import { Icon } from '../components/Icon'
import { callRemote, selectGamePath } from '../utils'
import {
  useAlwaysOnMods,
  useCurrentBlacklistProfile,
  useGamePath,
  useInstalledMods,
  useMirror,
  useStorage,
  useUseMultiThread,
} from '../states'
import { useEffect } from 'react'
import { Checkbox, Select, ListBox, Heading, Card, Button } from '@heroui/react'
import { useGlobalContext } from 'src/App'
import { LanuchButton } from 'src/components/LaunchButton'
import { useTranslation } from 'react-i18next'
import { useAlert } from 'src/components/alert'

export const Home = () => {
  const { t, i18n } = useTranslation()

  const [gamePath, setGamePath] = useGamePath()
  const [gamePaths, setGamePaths] = useState<string[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const paths = (await callRemote('get_celeste_dirs')) as string[]
        setGamePaths(paths.filter((v) => v))
        if (!gamePath && paths.length > 0) {
          // setGamePath(paths[0]);
        }
      } catch (e) {
        console.error('Failed to get Celeste dirs:', e)
      }
    })()
  }, [])
  const globalCtx = useGlobalContext()

  const [lastUseMap, setLastUseMap] = useState<{
    [profile: string]: number
  }>({})

  const {
    profiles,
    setProfiles,
    currentProfileName,
    setCurrentProfileName,
    currentProfile,
    setCurrentProfile,
  } = useCurrentBlacklistProfile()

  const st = useStorage()

  useEffect(() => {
    ;(async () => {
      if (!st.ready) return
      const lastUseMap = (await st.get('lastUseMap')) || {}
      setLastUseMap(lastUseMap)
    })()
  }, [st.ready])

  useEffect(() => {
    if (!gamePath) return
    ;(async () => {
      try {
        const profile = (await callRemote('get_current_profile', gamePath)) as string
        setCurrentProfileName(profile)
        const profilesData = (await callRemote('get_blacklist_profiles', gamePath)) as any[]
        setProfiles(profilesData)
      } catch (e) {
        console.error('Failed to load profiles:', e)
      }
    })()
  }, [gamePath])

  useEffect(() => {
    setCurrentProfile(profiles.find((v) => v.name === currentProfileName) || null)
  }, [currentProfileName, profiles])

  const [alwaysOnMods] = useAlwaysOnMods()

  const alert = useAlert()
  useEffect(() => {
    if (!currentProfile || !gamePath) return

    effect()

    async function effect() {
      const content = (await callRemote('get_current_blacklist_content', gamePath)) as string
      const disabledFiles = (content || '')
        .split('\n')
        .map((v) => v.trim())
        .filter((v) => v && !v.startsWith('#'))
        .sort()
      const expectedDisabledFiles = currentProfile.mods
        .filter((m) => !alwaysOnMods.includes(m.name))
        .map((m) => m.file)
        .sort()
      if (
        expectedDisabledFiles.some((file) => !disabledFiles.includes(file)) ||
        disabledFiles.some((file) => !expectedDisabledFiles.includes(file))
      ) {
        alert({
          status: 'warning',
          title: t('黑名单同步警告'),
          message: (
            <>
              <p>{t('当前的 blacklist.txt 与配置文件不同。您想要同步配置文件以匹配吗？')}</p>
              <p>
                {`不同的 Mod: ${[
                  ...new Set([
                    ...expectedDisabledFiles.filter((file) => !disabledFiles.includes(file)),
                    ...disabledFiles.filter((file) => !expectedDisabledFiles.includes(file)),
                  ]),
                ].join(', ')}`}
              </p>
              <p>{t('注意，该功能不支持通配符等')}</p>
            </>
          ),
          cancelText: t('取消'),
          okText: t('同步'),
          onOk: async () => {
            await callRemote('sync_blacklist_profile_from_file', gamePath, currentProfileName)
            const profilesData = (await callRemote('get_blacklist_profiles', gamePath)) as any[]
            setProfiles(profilesData)
          },
        })
      }
    }
  }, [currentProfile, gamePath, alwaysOnMods, currentProfileName])

  const formatTime = (time: number) => {
    if (time === 0) return t('未知')
    const d = Date.now() - time
    if (d < 60000) return t('刚刚')
    if (d < 3600000) return t('{slot0}分钟前', { slot0: Math.floor(d / 60000) })
    if (d < 86400000) return t('{slot0}小时前', { slot0: Math.floor(d / 3600000) })
    if (d < 2592000000) return t('{slot0}天前', { slot0: Math.floor(d / 86400000) })
    if (d < 31536000000) return t('{slot0}月前', { slot0: Math.floor(d / 2592000000) })
    return t('很久以前')
  }

  const [downloadMirror, setDownloadMirror] = useMirror()
  const [useMultiThread, setUseMultiThread] = useUseMultiThread()
  const { installedMods } = useInstalledMods()

  return (
    <div className="flex flex-col gap-10 p-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <img src="/Celemod.png" alt="" className="size-12 rounded-xl" />
        <div>
          <Heading level={1} className="text-xl">
            CeleMod
          </Heading>
          <p className="text-sm text-muted">An alternative mod manager for Celeste</p>
        </div>
      </div>

      <div>
        {gamePath ? (
          <GameSelector
            paths={gamePaths}
            onSelect={(value: string) => {
              if (value === '__other__') {
                selectGamePath(setGamePath)
              } else setGamePath(value)
            }}
            launchGame={(v) => {
              lastUseMap[currentProfileName] = Date.now()
              setLastUseMap(lastUseMap)
              st.set('lastUseMap', lastUseMap)
              st.save()
              callRemote('start_game_directly', gamePath || gamePaths[0], v === 'origin')
            }}
          />
        ) : (
          <p>
            {t('未找到游戏！请先安装 Steam 商店或 Epic 商店版的 Celeste，或')}
            <Button
              variant="tertiary"
              className="ml-1 text-accent"
              onPress={() => selectGamePath(setGamePath)}
            >
              {t('点此手动选择')}
            </Button>
          </p>
        )}
      </div>

      <div>
        <Heading level={2} className="flex items-center gap-2 text-base">
          <Icon name="download" /> {t('下载设置')}
        </Heading>

        <div className="rounded-xl flex flex-col gap-4 mt-2">
          <div className="flex items-center gap-3">
            <span className="text-sm shrink-0">{t('下载镜像')}</span>
            <Select
              className="w-40"
              variant="secondary"
              value={downloadMirror}
              onChange={(v) => setDownloadMirror(v as string)}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="0x0ade" textValue="0x0ade">
                    0x0ade
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="gamebanana" textValue="GameBanana">
                    GameBanana
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="wegfan" textValue="WEGFan">
                    WEGFan
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
          <Checkbox isSelected={useMultiThread} onChange={(v) => setUseMultiThread(v)}>
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              {t('使用 ureq 多线程下载')}
            </Checkbox.Content>
          </Checkbox>
        </div>
      </div>

      <div>
        <Heading level={2} className="flex items-center gap-2 text-base">
          <Icon name="file" /> {t('Profile 选择')}
        </Heading>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
          {profiles.map((v) => (
            <Card
              key={v.name}
              className={`p-3 transition-colors ${v.name === currentProfileName ? 'ring-2 ring-accent' : ''}`}
              onClick={() => {
                globalCtx.blacklist.switchProfile(v.name)
              }}
            >
              <Card.Title className="text-sm font-semibold">{v.name}</Card.Title>
              <Card.Description className="text-xs text-muted mt-1">
                {t('上次启动')}: {formatTime(lastUseMap[v.name] || 0)}
              </Card.Description>
              <Card.Description className="text-xs text-muted">
                {t('启用的 Mod 数')}: {installedMods.length - v.mods.length}
              </Card.Description>

              <LanuchButton
                className="mt-2"
                onClick={(e) => {
                  e.stopPropagation?.()
                  globalCtx.blacklist.switchProfile(v.name)
                  lastUseMap[v.name] = Date.now()
                  setLastUseMap(lastUseMap)
                  st.set('lastUseMap', lastUseMap)
                  st.save()
                  callRemote('start_game_directly', gamePath || gamePaths[0], false)
                }}
              />
            </Card>
          ))}
        </div>
      </div>

      <div>
        <Heading level={2} className="flex items-center gap-2 text-base">
          <Icon name="edit" /> {t('界面设置')}
        </Heading>

        <div className="rounded-xl mt-2">
          <div className="flex items-center gap-3">
            <span className="text-sm">{t('语言/Language')}</span>
            <Select
              className="w-40"
              variant="secondary"
              value={i18n.language}
              onChange={(v) => {
                const lang = v as string
                i18n.changeLanguage(lang)
                setDownloadMirror(lang === 'zh-CN' ? 'wegfan' : '0x0ade')
              }}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="zh-CN" textValue="简体中文">
                    简体中文
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="en-US" textValue="English">
                    English
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="ru-RU" textValue="русский">
                    русский
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="pt-BR" textValue="Brazilian Portuguese">
                    Brazilian Portuguese
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}
