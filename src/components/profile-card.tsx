import { Card } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { useGlobalContext } from 'src/App'
import { useCurrentBlacklistProfile, useGamePath, useInstalledMods, useStorage } from 'src/states'
import { LanuchButton } from './LaunchButton'
import { callRemote } from 'src/utils'
import { ModBlacklistProfile } from 'src/ipc/blacklist'

interface Props extends Omit<ModBlacklistProfile, 'mod_options_order'> {
  lastUseMap: Record<string, number>
  setLastUseMap: React.Dispatch<React.SetStateAction<Record<string, number>>>
  gamePaths: string[]
  className?: string
}

export function ProfileCard({
  name,
  mods,
  lastUseMap,
  setLastUseMap,
  gamePaths,
  className,
}: Props) {
  const [gamePath] = useGamePath()
  const { blacklist } = useGlobalContext()
  const { currentProfileName } = useCurrentBlacklistProfile()
  const { installedMods } = useInstalledMods()
  const { t } = useTranslation()
  const st = useStorage()

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

  return (
    <Card
      className={`p-3 transition-colors cursor-default ${name === currentProfileName ? 'ring-2 ring-accent' : ''} ${className ?? ''}`}
      onClick={() => {
        blacklist.switchProfile(name)
      }}
    >
      <Card.Title className="text-sm font-semibold">{name}</Card.Title>
      <Card.Description className="text-xs text-muted mt-1">
        {t('上次启动')}: {formatTime(lastUseMap[name] || 0)}
      </Card.Description>
      <Card.Description className="text-xs text-muted">
        {t('启用的 Mod 数')}: {installedMods?.length ? installedMods.length - mods.length : '-'}
      </Card.Description>

      <LanuchButton
        className="mt-2"
        onClick={(e) => {
          e.stopPropagation?.()
          blacklist.switchProfile(name)
          lastUseMap[name] = Date.now()
          setLastUseMap(lastUseMap)
          st.set('lastUseMap', lastUseMap)
          st.save()
          callRemote('start_game_directly', gamePath || gamePaths[0], false)
        }}
      />
    </Card>
  )
}
