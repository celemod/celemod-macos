import { createContext } from 'react'
import {
  BackendDep,
  BackendModInfo,
  useAlwaysOnMods,
  useAutoDisableNewMods,
  useCurrentBlacklistProfile,
  useGamePath,
  useInstalledMods,
  useModComments,
} from '../states'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { callRemote, compareVersion } from '../utils'
import { Icon } from '../components/Icon'
import { Button } from '../components/Button'
import { useGlobalContext } from '../App'
import { enforceEverest } from '../components/EnforceEverestPage'
import { createPopup, PopupContext } from '../components/Popup'
import { ProgressIndicator } from '../components/Progress'
import { Card, Checkbox, Heading, Input } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { ModListItem } from 'src/components/mod-list-item'

type DepState = 'resolved' | 'missing' | 'not-enabled' | 'mismatched-version'

interface DepResolveResult {
  status: DepState
  message: string
}

interface ModInfo {
  name: string
  id: string
  enabled: boolean
  dependencies: ModDepInfo[]
  dependedBy: ModInfo[]
  version: string
  _deps: BackendDep[] // raw deps
  resolveDependencies: () => DepResolveResult
  file: string
  size: number
  duplicateCount: number
  duplicateFiles: string[]
}

interface MissingModDepInfo {
  name: string
  id: string
  optional: boolean
  version: string
  _missing: true
}

interface FullModCheckIssue {
  file: string
  error: string
}

interface FullModCheckProgress {
  current: number
  total: number
  file: string
  done: boolean
  issues: FullModCheckIssue[]
}

type ModInfoProbablyMissing = ModInfo | MissingModDepInfo

type ModDepInfo = ModInfoProbablyMissing & {
  optional: boolean
}

export const modListContext = createContext<{
  switchMod: (id: string, enabled: boolean, recursive?: boolean) => void
  switchProfile: (name: string) => void
  removeProfile: (name: string) => void
  deleteMod: (name: string) => void
  modFolder: string
  gamePath: string
  currentProfileName: string
  reloadMods: () => void
  fullTree: boolean
  showUpdate: boolean
  showDetailed: boolean
  alwaysOnMods: string[]
  switchAlwaysOn: (name: string, enabled: boolean) => void
  autoDisableNewMods: boolean
  hasUpdateMods: {
    name: string
    version: string
    gb_file: string
  }[]
  modComments: { [name: string]: string }
  setModComment: (name: string, comment: string) => void
} | null>({} as any)

const excludeList = ['Everest', 'Celeste', 'EverestCore']

const Profile = ({
  name,
  current,
  className,
}: {
  name: string
  current: boolean
  className?: string
}) => {
  const ctx = useContext(modListContext)

  return (
    <Card
      className={`p-2 transition-colors ${current ? 'ring-2 ring-accent' : ''} ${className}`}
      onClick={() => {
        ctx?.switchProfile(name)
      }}
    >
      <Card.Title className="text-sm font-semibold">{name}</Card.Title>
      <Card.Footer>
        <Button
          size="sm"
          isDisabled={name === 'Default'}
          type="ghost"
          onClick={(e: any) => {
            e.stopPropagation?.()
            ctx?.removeProfile(name)
          }}
        >
          <Icon name="delete" />
        </Button>
      </Card.Footer>
    </Card>
  )
}

const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- _'

let lastApplyReq = -1

const ModOptionsOrderPanel = ({
  gamePath,
  currentProfileName,
  currentProfile,
  installedMods,
  onOrderChange,
}: {
  gamePath: string
  currentProfileName: string
  currentProfile: import('../ipc/blacklist').ModBlacklistProfile | null
  installedMods: import('../states').BackendModInfo[]
  onOrderChange: (order: string[]) => void
}) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const order: string[] = currentProfile?.mod_options_order ?? []

  const allFiles = useMemo(() => {
    const files = installedMods.map((m) => m.file)
    const inOrder = order.filter((f) => files.includes(f))
    const rest = files
      .filter((f) => !order.includes(f))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    return [...inOrder, ...rest]
  }, [installedMods, order])

  const applyOrder = (newOrder: string[]) => {
    onOrderChange(newOrder)
    callRemote('set_mod_options_order', gamePath, currentProfileName, newOrder)
  }

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= allFiles.length) return
    const next = [...allFiles]
    ;[next[index], next[target]] = [next[target], next[index]]
    applyOrder(next)
  }

  const moveToTop = (index: number) => {
    if (index === 0) return
    const next = [...allFiles]
    const [item] = next.splice(index, 1)
    next.unshift(item)
    applyOrder(next)
  }

  if (!currentProfile) return null

  return (
    <div className="mod-options-order">
      <div className="moo-header flex items-center" onClick={() => setExpanded((v) => !v)}>
        <Icon name={expanded ? 'i-down' : 'i-right'} />
        <span>{t('Mod Options 顺序')}</span>
      </div>
      {expanded && (
        <div className="moo-list">
          {allFiles.map((file, i) => (
            <div className="moo-item flex items-center gap-x-2" key={file}>
              <span className="moo-btns inline-flex items-center gap-x-1">
                <button
                  className={i === 0 ? 'disabled' : ''}
                  onClick={() => moveToTop(i)}
                  title={t('置顶')}
                >
                  ⤒
                </button>
                <button className={i === 0 ? 'disabled' : ''} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button
                  className={i === allFiles.length - 1 ? 'disabled' : ''}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
              </span>

              <span className="moo-name" title={file}>
                {file}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Manage() {
  const { t } = useTranslation()
  const noEverest = enforceEverest()
  if (noEverest) return noEverest
  const [alwaysOnMods, setAlwaysOnMods] = useAlwaysOnMods()
  const [autoDisableNewMods, setAutoDisableNewMods] = useAutoDisableNewMods()
  const [gamePath] = useGamePath()
  const modPath = gamePath + '/Mods'

  const {
    profiles,
    setProfilesCallback,
    currentProfileName,
    setCurrentProfileName,
    currentProfile,
    setCurrentProfile,
  } = useCurrentBlacklistProfile()

  const { installedMods, setInstalledMods } = useInstalledMods()

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const [excludeDependents, setExcludeDependents] = useState(true)
  const [checkOptionalDep, setCheckOptionalDep] = useState(false)
  const [fullTree, setFullTree] = useState(false)
  const [showUpdate, setShowUpdate] = useState(true)
  const [showDetailed, setShowDetailed] = useState(false)
  const [fullCheckRunning, setFullCheckRunning] = useState(false)

  const installedModMap = useMemo(() => {
    const modMap = new Map<string, ModInfo>()
    const backendModMap = new Map<string, BackendModInfo>()
    for (const mod of installedMods) {
      backendModMap.set(mod.name, mod)
    }

    for (const mod of installedMods) {
      const modInfo: ModInfo = {
        name: mod.name,
        id: mod.game_banana_id,
        enabled: currentProfile?.mods.every((v) => v.name !== mod.name) ?? true,
        version: mod.version,
        dependencies: [],
        dependedBy: [],
        file: mod.file,
        size: mod.size,
        _deps: mod.deps,
        resolveDependencies: () => {
          const resolveModDependencies = (
            current: BackendModInfo,
            visiting = new Set<string>(),
          ) => {
            if (visiting.has(current.name)) {
              return { status: 'resolved', message: '' } as DepResolveResult
            }

            visiting.add(current.name)

            let status = 'resolved'
            let message = ''

            const mergeSM = (
              s: {
                status: DepState
                message: string
              },
              name: string,
            ) => {
              if (s.status === 'resolved') return
              if (status === 'resolved') {
                status = s.status
              }
              message += ` | ${name}(${s.status}):${s.message}`
            }

            for (const dep of current.deps) {
              if (excludeList.includes(dep.name) || (dep.optional && !checkOptionalDep)) {
                continue
              }

              if (!modMap.has(dep.name)) {
                mergeSM({ status: 'missing', message: '' }, dep.name)
                continue
              }

              const installedDep = modMap.get(dep.name)!
              if (compareVersion(installedDep.version, dep.version) < 0) {
                mergeSM(
                  {
                    status: 'mismatched-version',
                    message: `${current.name} requires ${installedDep.name} >= ${dep.version} but got ${installedDep.version}`,
                  },
                  dep.name,
                )
              }

              if (!installedDep.enabled) {
                mergeSM(
                  {
                    status: 'not-enabled',
                    message: `${current.name} requires ${installedDep.name} to be enabled`,
                  },
                  dep.name,
                )
              }

              const depBackend = backendModMap.get(dep.name)
              if (depBackend) {
                const depRes = resolveModDependencies(depBackend, visiting)
                mergeSM(depRes, dep.name)
              }
            }

            visiting.delete(current.name)

            return { status, message } as DepResolveResult
          }

          return resolveModDependencies(mod)
        },
        duplicateCount: 1,
        duplicateFiles: [mod.file],
      }
      if (modMap.has(mod.name)) {
        modMap.get(mod.name)!.duplicateCount = modMap.get(mod.name)!.duplicateCount + 1
        modMap.get(mod.name)!.duplicateFiles.push(mod.file)
      } else {
        modMap.set(mod.name, modInfo)
      }
    }

    for (const modInfo of modMap.values()) {
      for (const dep of modInfo._deps) {
        if (!modMap.has(dep.name)) {
          modInfo.dependencies.push({
            name: dep.name,
            id: dep.name,
            version: dep.version,
            _missing: true,
            optional: dep.optional,
          })
        } else {
          const depInfo = modMap.get(dep.name)!
          modInfo.dependencies.push({
            ...depInfo,
            optional: dep.optional,
          })
          if (!dep.optional) depInfo.dependedBy.push(modInfo)
        }
      }
    }

    return modMap
  }, [installedMods, currentProfile, profiles, checkOptionalDep])

  const [latestModInfos, setLatestModInfos] = useState<
    [
      string,
      string,
      string,
      string, // name, version, gbfileid, url
    ][]
  >([])

  useEffect(() => {
    callRemote('get_mod_latest_info').then((v: any) => {
      setLatestModInfos(v)
    })
  }, [])

  const hasUpdateMods: {
    name: string
    version: string
    gb_file: string
    current: string
    url: string
  }[] = useMemo(() => {
    const mods = []
    for (const mod of installedMods) {
      const latest = latestModInfos.find((v) => v[0] === mod.name)
      if (latest && compareVersion(latest[1], mod.version) > 0) {
        mods.push({
          name: mod.name,
          version: latest[1],
          gb_file: latest[2],
          current: mod.version,
          url: latest[3],
        })
      }
    }

    // console.log('hasUpdateMods', JSON.stringify(mods, null, 4));

    return mods
  }, [latestModInfos, installedModMap])

  const [hasUpdateBtnState, setHasUpdateBtnState] = useState(t('更新全部'))

  const modsTreeRef = useRef(null)
  const [filter, setFilter] = useState('')

  const checkFilter = (filter: string, mod: ModInfoProbablyMissing) => {
    if (filter.includes('||')) return filter.split('||').some((f) => checkFilter(f, mod))

    const isSpecialFilter = (v) => v.startsWith(':') || v.startsWith('!') || v.startsWith('-')
    const args = filter.split(' ')
    const name = mod.name.toLowerCase()
    const nameFilter = args
      .filter((v) => !isSpecialFilter(v))
      .join(' ')
      .toLowerCase()
      .trim()

    // console.log(name, nameFilter);
    if (!name.includes(nameFilter)) return false

    const checkSpecialFilter = (arg: string) => {
      arg = arg.toLowerCase()

      if (arg.startsWith(':') || arg.startsWith('-')) arg = arg.slice(1)

      if (!('_missing' in mod)) {
        if (arg.startsWith('enable')) {
          return mod.enabled || alwaysOnMods.includes(mod.name)
        } else if (arg.startsWith('disable')) {
          return !checkSpecialFilter('enable')
        }

        if (arg.startsWith('hasdep') || arg.startsWith('havedep')) {
          return mod.dependencies.length > 0
        }

        if (
          arg.startsWith('update') ||
          arg.startsWith('hasupdate') ||
          arg.startsWith('haveupdate') ||
          arg.startsWith('outdate')
        ) {
          return hasUpdateMods.some((v) => v.name === mod.name)
        }
      }

      if (arg.startsWith('!')) {
        return !checkSpecialFilter(arg.slice(1))
      }
    }
    for (const arg of args.filter(isSpecialFilter)) {
      if (!checkSpecialFilter(arg)) return false
    }

    return true
  }

  const installedModsTree = useMemo(() => {
    const modTree = new Map<string, ModInfoProbablyMissing>()

    for (const mod of installedModMap.values()) {
      modTree.set(mod.name, mod)
    }

    const dfsRemove = (mod: ModInfoProbablyMissing, isRoot = false) => {
      if (filter && checkFilter(filter, mod)) return
      if (!isRoot) {
        modTree.delete(mod.name)
      }
      if ('_missing' in mod) {
        return
      }

      for (const dep of mod.dependencies) {
        if ((dep as any)._missing || dep.optional) {
          continue
        }

        dfsRemove(dep)
      }
    }

    if (excludeDependents)
      for (const mod of installedModMap.values()) {
        dfsRemove(mod, true)
      }

    if (filter) {
      for (const mod of modTree.values()) {
        if (!checkFilter(filter, mod)) {
          modTree.delete(mod.name)
        }
      }
    }

    return [...modTree.values()].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    )
  }, [installedModMap, excludeDependents, filter])

  useEffect(() => {
    // @ts-ignore
    modsTreeRef.current?.scrollTo(0, 0)
  }, [excludeDependents])
  const globalCtx = useGlobalContext()
  const [modComments, setModComments] = useModComments()
  const manageCtx = useMemo(
    () => ({
      hasUpdateMods,
      switchAlwaysOn: (name: string, enabled: boolean) => {
        if (enabled) setAlwaysOnMods([...alwaysOnMods, name])
        else setAlwaysOnMods(alwaysOnMods.filter((v) => v !== name))
      },
      alwaysOnMods,
      autoDisableNewMods,
      modComments,
      setModComment(name: string, comment: string) {
        setModComments({
          ...modComments,
          [name]: comment,
        })
      },
      batchSwitchMod: (names: string[], enabled: boolean) => {
        if (!enabled) names = names.filter((v) => !alwaysOnMods.includes(v))
        if (!currentProfile) return
        let files = []
        for (const mod of names) {
          const backendMod = installedMods.find((v) => v.name === mod)
          if (backendMod) {
            files.push(backendMod.file)
            if (!enabled) {
              currentProfile.mods.push({
                name: backendMod.name,
                file: backendMod.file,
              })
            }
          }
        }

        callRemote(
          'switch_mod_blacklist_profile',
          gamePath,
          currentProfileName,
          names,
          files,
          enabled,
        )

        if (enabled)
          currentProfile.mods = currentProfile?.mods.filter((v) => !names.includes(v.name)) ?? []

        setCurrentProfile({ ...currentProfile })
        setHasUnsavedChanges(true)

        lastApplyReq = Date.now()
        let thisReq = lastApplyReq
        setTimeout(() => {
          if (lastApplyReq === thisReq) {
            globalCtx.blacklist.switchProfile(manageCtx.currentProfileName)
            setHasUnsavedChanges(false)
          }
        }, 600)
      },
      switchMod: (names: string | string[], enabled: boolean, recursive = true) => {
        if (!currentProfile) {
          createPopup(() => {
            const { hide } = useContext(PopupContext)

            return (
              <div className="popup-content">
                <div className="title">{t('未选择 Profile')}</div>
                <div className="content">{t('请先选择一个 Profile 后再启用/禁用 Mod')}</div>
                <div className="buttons">
                  <Button onClick={hide}>{t('确定')}</Button>
                </div>
              </div>
            )
          })
          return
        }

        const switchList: string[] = []
        const excludeFromAutoEnableList = ['CelesteNet.Client', 'Miao.CelesteNet.Client']

        const visited = new Set<string>()

        const addToSwitchList = (name: string) => {
          if (visited.has(name)) return
          visited.add(name)

          const mod = installedModMap.get(name)
          if (mod) {
            mod.enabled = enabled
            switchList.push(name)
          } else {
            return
          }

          if (recursive) {
            if (enabled) {
              const deps = mod?.dependencies.filter((v) => checkOptionalDep || !v.optional)

              // console.log('also enable', deps?.map(v => v.name).join(','), 'for', name);

              for (const dep of deps ?? []) {
                if (!('_missing' in dep)) {
                  if (excludeFromAutoEnableList.includes(dep.name)) continue
                  addToSwitchList(dep.name)
                }
              }
            } else {
              const orphanDeps = mod?.dependencies
                .filter(
                  (v) =>
                    !('_missing' in v) && !v.dependedBy.some((v) => v.enabled && v.name !== name),
                )
                .filter((v) => checkOptionalDep || !v.optional)

              for (const dep of orphanDeps ?? []) {
                addToSwitchList(dep.name)
              }
            }
          }
        }

        if (typeof names === 'string') {
          names = [names]
        }
        for (const name of names) {
          addToSwitchList(name)
        }

        manageCtx.batchSwitchMod(switchList, enabled)

        setHasUnsavedChanges(true)
      },
      switchProfile: (name: string) => {
        if (hasUnsavedChanges) return
        globalCtx.blacklist.switchProfile(name)
        setHasUnsavedChanges(false)
      },
      removeProfile: async (name: string) => {
        await callRemote('remove_mod_blacklist_profile', gamePath, name)
        setProfilesCallback((profiles) => profiles.filter((v) => v.name !== name))
        if (currentProfileName === name) {
          setCurrentProfileName(profiles[0].name)
        }
      },
      createProfile: async (name: string) => {
        await callRemote('new_mod_blacklist_profile', gamePath, name)
        // @ts-ignore
        setProfilesCallback((profiles) => profiles.concat({ name, mods: [] }))
        setCurrentProfileName(name)
      },
      deleteMod: (name: string) => {
        const modToDelete = installedModMap.get(name)
        if (!modToDelete) return

        // Find mods that depend on this mod
        const dependentMods = modToDelete.dependedBy

        // Find orphaned mods (mods that will have no references after deletion)
        const orphanedMods: ModInfo[] = []
        const visited = new Set<string>()

        const checkOrphans = (mod: ModInfo) => {
          if (visited.has(mod.name)) return
          visited.add(mod.name)

          for (const dep of mod.dependencies) {
            if ('_missing' in dep) continue
            const depInfo = installedModMap.get(dep.name)
            if (!depInfo) continue

            // Check if this dependency will be orphaned after deletion
            const remainingDependents = depInfo.dependedBy.filter(
              (m) => m.name !== name && !orphanedMods.includes(m),
            )

            if (remainingDependents.length === 0 && !orphanedMods.includes(depInfo)) {
              orphanedMods.push(depInfo)
              checkOrphans(depInfo)
            }
          }
        }
        checkOrphans(modToDelete)

        createPopup(() => {
          const { hide } = useContext(PopupContext)
          const [selectedOrphans, setSelectedOrphans] = useState<string[]>(
            orphanedMods.map((m) => m.name),
          )

          const handleDelete = () => {
            const modsToDelete = [name, ...selectedOrphans]
            callRemote('delete_mods', gamePath, modsToDelete).then(() => {
              manageCtx.reloadMods()
              hide()
            })
          }

          return (
            <div className="delete-mod-popup">
              <div className="title">{t('删除 Mod 确认')}</div>

              {dependentMods.length > 0 && (
                <div className="warning-section">
                  <div className="warning-title">{t('⚠️ 警告：以下 Mod 依赖此 Mod')}</div>
                  <div className="dependent-mods">
                    {dependentMods.map((mod) => (
                      <div key={mod.id + '-' + mod.name} className="dependent-mod">
                        {mod.name} {mod.version} {mod.enabled ? '' : t('(已禁用)')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="delete-target">
                {t('将要删除：')}{' '}
                <strong>
                  {name} {modToDelete.version}
                </strong>
              </div>

              {orphanedMods.length > 0 && (
                <div className="orphan-section">
                  <div className="orphan-title">
                    {t('以下 Mod 将不再被任何 Mod 引用，是否一并删除？')}
                  </div>
                  <div className="orphan-list">
                    {orphanedMods.map((mod) => (
                      <label key={mod.id + '-' + mod.name} className="orphan-item">
                        <input
                          type="checkbox"
                          checked={selectedOrphans.includes(mod.name)}
                          onChange={(e) => {
                            const target = e.target as HTMLInputElement
                            if (target.checked) {
                              setSelectedOrphans([...selectedOrphans, mod.name])
                            } else {
                              setSelectedOrphans(selectedOrphans.filter((n) => n !== mod.name))
                            }
                          }}
                        />
                        <span>
                          {mod.name} {mod.version}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="buttons">
                <Button onClick={hide}>{t('取消')}</Button>
                <Button className="delete-confirm" onClick={handleDelete}>
                  {t('确认删除')}
                </Button>
              </div>
            </div>
          )
        })
      },
      gamePath,
      modFolder: modPath,
      currentProfile,
      currentProfileName,
      reloadMods() {
        callRemote('get_installed_mods', modPath).then((data: any[]) => {
          setInstalledMods(data)
        })
      },
      fullTree,
      showUpdate,
      showDetailed,
    }),
    [
      currentProfile,
      installedMods,
      gamePath,
      modPath,
      fullTree,
      showUpdate,
      showDetailed,
      alwaysOnMods,
      modComments,
      checkOptionalDep,
    ],
  )

  const { download } = useGlobalContext()

  const startFullModCheck = () => {
    if (fullCheckRunning) return
    setFullCheckRunning(true)

    createPopup(
      () => {
        const { hide } = useContext(PopupContext)
        const [progress, setProgress] = useState<FullModCheckProgress>({
          current: 0,
          total: 0,
          file: '',
          done: false,
          issues: [],
        })
        const [deleteState, setDeleteState] = useState<'idle' | 'deleting' | 'done' | 'failed'>(
          'idle',
        )

        useEffect(() => {
          callRemote('check_all_mod_contents', modPath, (data: any) => {
            const next = data
            setProgress(next)
            if (next.done) {
              setFullCheckRunning(false)
            }
          })
        }, [])

        const progressValue = progress.total === 0 ? 0 : progress.current
        const issueCount = progress.issues.length
        const deleteBrokenMods = () => {
          if (deleteState === 'deleting' || issueCount === 0) return
          setDeleteState('deleting')
          callRemote(
            'delete_mod_files',
            modPath,
            progress.issues.map((issue) => issue.file),
            () => {
              setDeleteState('done')
              manageCtx.reloadMods()
            },
          )
        }

        return (
          <div className="popup-content full-mod-check-popup">
            <div className="title">{t('检查全部 Mod 是否正常')}</div>
            {!progress.done ? (
              <div className="content full-mod-check-content">
                <div className="progress-wrap">
                  <ProgressIndicator
                    value={progressValue}
                    max={progress.total || 1}
                    size={80}
                    lineWidth={6}
                  />
                </div>
                <p>{t('正在检查 Mod 实际内容，这可能需要一些时间。')}</p>
                <p>
                  {t('进度：{current}/{total}', {
                    current: progress.current,
                    total: progress.total,
                  })}
                </p>
                {progress.file && <p>{t('当前文件：{file}', { file: progress.file })}</p>}
              </div>
            ) : (
              <div className="content full-mod-check-content">
                <p>
                  {issueCount === 0
                    ? t('检查完成，未发现损坏的 Mod 压缩包。')
                    : t('检查完成，发现 {count} 个损坏或无法完整读取的 Mod 压缩包。', {
                        count: issueCount,
                      })}
                </p>
                {issueCount > 0 && (
                  <div className="issues">
                    {progress.issues.map((issue) => (
                      <div className="issue-item" key={issue.file}>
                        <div className="issue-file">{issue.file}</div>
                        <div className="issue-error">{issue.error}</div>
                      </div>
                    ))}
                  </div>
                )}
                {deleteState === 'done' && <p>{t('已删除损坏的 Mod 压缩包。')}</p>}
              </div>
            )}
            <div className="buttons">
              {progress.done && issueCount > 0 && deleteState !== 'done' && (
                <Button onClick={deleteBrokenMods}>
                  {deleteState === 'deleting' ? t('删除中...') : t('删除这些损坏 Mod')}
                </Button>
              )}
              <Button
                onClick={() => {
                  if (!progress.done) return
                  hide()
                }}
              >
                {progress.done ? t('确定') : t('检查中...')}
              </Button>
            </div>
          </div>
        )
      },
      { cancelable: false },
    )
  }

  // Collect all unique missing dependencies across all installed mods
  const missingDeps = useMemo(() => {
    const missing = new Map<string, string>() // name -> version
    for (const mod of installedModMap.values()) {
      for (const dep of mod._deps) {
        if (excludeList.includes(dep.name)) continue
        if (dep.optional && !checkOptionalDep) continue
        if (!installedModMap.has(dep.name)) {
          if (!missing.has(dep.name)) {
            missing.set(dep.name, dep.version)
          }
        }
      }
    }
    return [...missing.entries()].map(([name, version]) => ({ name, version }))
  }, [installedModMap])

  const [fixDepsState, setFixDepsState] = useState<'idle' | 'downloading'>('idle')

  return (
    <div className="manage">
      <modListContext.Provider value={manageCtx}>
        <div className="modList">
          <Heading level={1}>{t('Mod 列表')}</Heading>
          <div className="space-x-1 mt-2">
            <Input
              placeholder={t('筛选 Mod')}
              type="text"
              value={filter}
              onChange={(e) => {
                setFilter((e.target as any).value)
              }}
            />
            <Button
              onClick={async () => {
                await callRemote('open_url', gamePath + '/Mods')
              }}
            >
              {t('打开 Mods 文件夹')}
            </Button>
            <Button
              onClick={() => {
                manageCtx.switchMod(
                  [...installedModsTree.values()]
                    .filter((v) => {
                      return '_missing' in v || v.enabled
                    })
                    .map((v) => v.name),
                  false,
                )
                manageCtx.switchMod(alwaysOnMods, true, true)
              }}
            >
              {t('禁用全部')}
            </Button>
            <Button
              onClick={() => {
                manageCtx.batchSwitchMod(
                  installedMods.map((v) => v.name),
                  true,
                )
              }}
            >
              {t('启用全部')}
            </Button>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            <Checkbox isSelected={excludeDependents} onChange={setExcludeDependents}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {t('只显示不被依赖的Mod')}
              </Checkbox.Content>
            </Checkbox>

            <Checkbox isSelected={checkOptionalDep} onChange={setCheckOptionalDep}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {t('检查可选依赖')}
              </Checkbox.Content>
            </Checkbox>

            <Checkbox isSelected={fullTree} onChange={setFullTree}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {t('显示完整树')}
              </Checkbox.Content>
            </Checkbox>

            <Checkbox isSelected={showUpdate} onChange={setShowUpdate}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {t('显示更新')}
              </Checkbox.Content>
            </Checkbox>

            <Checkbox isSelected={autoDisableNewMods} onChange={setAutoDisableNewMods}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {t('自动禁用新安装的Mod')}
              </Checkbox.Content>
            </Checkbox>

            <Checkbox isSelected={showDetailed} onChange={setShowDetailed}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {t('显示详细信息')}
              </Checkbox.Content>
            </Checkbox>
          </div>

          <div
            className="opers"
            style={{
              marginTop: '5px',
            }}
          >
            <Button onClick={startFullModCheck} isDisabled={fullCheckRunning}>
              {fullCheckRunning ? t('检查中...') : t('检查全部 Mod 是否正常')}
            </Button>
            {showUpdate && hasUpdateMods.length !== 0 && (
              <Button
                onClick={() => {
                  if (hasUpdateBtnState !== t('更新全部')) return
                  setHasUpdateBtnState(t('更新中'))
                  const updateUnfinishedSet = new Set(hasUpdateMods.map((v) => v.name))
                  for (const mod of hasUpdateMods) {
                    download.downloadMod(mod.name, mod.gb_file === '-1' ? mod.url : mod.gb_file, {
                      autoDisableNewMods: manageCtx.autoDisableNewMods,
                      onProgress: (task, progress) => {
                        console.log(task, progress)
                      },
                      onFinished: () => {
                        updateUnfinishedSet.delete(mod.name)
                        if (updateUnfinishedSet.size === 0) {
                          setHasUpdateBtnState(t('更新完成'))
                          manageCtx.reloadMods()
                        }
                      },
                      onFailed: () => {
                        console.log('failed')
                        setHasUpdateBtnState(t('更新失败，请查看左下角'))
                      },
                      force: true,
                    })
                  }
                }}
              >
                {hasUpdateBtnState}
              </Button>
            )}

            {missingDeps.length > 0 && (
              <Button
                onClick={async () => {
                  if (fixDepsState === 'downloading') return
                  setFixDepsState('downloading')
                  const remaining = new Set(missingDeps.map((d) => d.name))
                  for (const dep of missingDeps) {
                    try {
                      const data = (await callRemote('get_mod_update', dep.name)) as any[]
                      if (!data) {
                        remaining.delete(dep.name)
                        if (remaining.size === 0) {
                          setFixDepsState('idle')
                          manageCtx.reloadMods()
                        }
                        return
                      }
                      const [gbFileId] = data
                      download.downloadMod(dep.name, gbFileId, {
                        autoDisableNewMods: manageCtx.autoDisableNewMods,
                        onFinished: () => {
                          remaining.delete(dep.name)
                          if (remaining.size === 0) {
                            setFixDepsState('idle')
                            manageCtx.reloadMods()
                          }
                        },
                        onFailed: () => {
                          remaining.delete(dep.name)
                          if (remaining.size === 0) {
                            setFixDepsState('idle')
                          }
                        },
                      })
                    } catch (error) {
                      console.error(error)
                    }
                  }
                }}
              >
                {fixDepsState === 'downloading'
                  ? t('下载中')
                  : t('补全缺失依赖 ({count})', { count: missingDeps.length })}
              </Button>
            )}
          </div>
          <div className="mt-4 space-y-1" ref={modsTreeRef}>
            {installedModsTree.map((v) => (
              <ModListItem key={v.id + '-' + v.name} {...(v as any)} />
            ))}
          </div>
        </div>

        <div className="profiles mt-8 space-y-2">
          <Heading level={1}>{t('Profile 列表')}</Heading>

          <div className="flex gap-2 flex-wrap">
            {profiles.map((v) => (
              <Profile
                key={v.name}
                {...v}
                current={v.name === currentProfileName}
                className="w-24"
              />
            ))}
          </div>

          <div className="newProfile">
            <Input
              placeholder={t('Profile 名')}
              /* @ts-ignore */
              filter={alphabet}
              maxLength={30}
            />

            <Button
              onClick={() => {
                const name = document.querySelector('.newProfile input') as any
                if (name.value && !profiles.some((v) => v.name === name.value)) {
                  manageCtx.createProfile(name.value)
                  name.value = ''
                }
              }}
            >
              {t('新建')}
            </Button>
          </div>

          <div className="mt-4">
            <ModOptionsOrderPanel
              gamePath={gamePath}
              currentProfileName={currentProfileName}
              currentProfile={currentProfile}
              installedMods={installedMods}
              onOrderChange={(newOrder) => {
                if (currentProfile) {
                  currentProfile.mod_options_order = newOrder
                  setCurrentProfile({ ...currentProfile })
                }
              }}
            />
          </div>
        </div>
      </modListContext.Provider>
    </div>
  )
}
