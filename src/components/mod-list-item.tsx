import { Chip } from '@heroui/react'
import { useState, useContext, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useGlobalContext } from 'src/App'
import { callRemote } from 'src/utils'
import { Icon } from './Icon'
import { BackendDep, useInstalledMods } from 'src/states'
import { modListContext } from 'src/routes/Manage'
import { AlertDialog } from './alert-dialog'
import { useDeleteMods } from 'src/hooks/use-delete-mods'

type DepState = 'resolved' | 'missing' | 'not-enabled' | 'mismatched-version'

interface DepResolveResult {
  status: DepState
  message: string
}

interface MissingModDepInfo {
  name: string
  id: string
  optional: boolean
  version: string
  _missing: true
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

type ModInfoProbablyMissing = ModInfo | MissingModDepInfo

type ModDepInfo = ModInfoProbablyMissing & {
  optional: boolean
}

const formatSize = (size: number) => {
  const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024))
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  return `${(size / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
}

const excludeList = ['Everest', 'Celeste', 'EverestCore']

export function ModListItem(
  props: ModDepInfo & { renderPath?: string[]; installedModMap?: Map<string, ModInfo> },
) {
  if (excludeList.includes(props.name)) {
    return null
  }
  if ('_missing' in props) {
    return <ModMissing {...props} />
  }
  return <ModLocal {...props} />
}

function ModMissing({ name, version, optional }: MissingModDepInfo) {
  const { t } = useTranslation()
  const { reloadMods } = useInstalledMods()
  const { download } = useGlobalContext()
  const ctx = useContext(modListContext)
  const [state, setState] = useState(t('缺失'))
  const [gbFileID, setGBFileID] = useState<string | null>(null)

  useEffect(() => {
    handler()

    async function handler() {
      const data = (await callRemote('get_mod_update', name)) as any[]
      if (data) {
        const [gbFileId] = data
        setGBFileID(gbFileId)
        if (optional) setState(t('点击下载'))
        else setState(t('缺失·点击下载'))
      }
    }
  }, [name])

  return (
    <div className="m-mod missing flex items-center gap-x-1">
      <Icon className="text-warning" name="warn" />
      <Chip
        variant="soft"
        color={optional ? 'accent' : 'danger'}
        onClick={() => {
          if (gbFileID === null) {
            return
          }

          setState(t('下载中'))
          download.downloadMod(name, gbFileID, {
            autoDisableNewMods: ctx?.autoDisableNewMods || false,
            onProgress: (task, progress) => {
              setState(`${progress}% (${task.subtasks.length})`)
            },
            onFinished: () => {
              setState(t('下载完成'))
              reloadMods()
            },
            onFailed: () => {
              setState(t('下载失败'))
            },
          })
        }}
      >
        <Chip.Label>{state}</Chip.Label>
      </Chip>

      {optional && (
        <Chip variant="soft" color="warning">
          <Chip.Label>{t('可选依赖')}</Chip.Label>
        </Chip>
      )}

      <span>
        {name} <ModVersionText version={version} />
      </span>
    </div>
  )
}

function ModLocal({
  name,
  id,
  enabled,
  dependencies,
  resolveDependencies,
  dependedBy,
  version,
  optional = false,
  file,
  size,
  duplicateCount,
  duplicateFiles,
  renderPath = [],
  installedModMap,
}: ModInfo & {
  optional?: boolean
  renderPath?: string[]
  installedModMap?: Map<string, ModInfo>
}) {
  const { t } = useTranslation()
  const { reloadMods } = useInstalledMods()
  const { download } = useGlobalContext()
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)

  const ctx = useContext(modListContext)
  const hasCycle = renderPath.includes(name)

  const hasDeps = useMemo(
    () => dependencies.some((v) => !excludeList.includes(v.name)),
    [dependencies],
  )

  const dependedByFiltered = useMemo(() => dependedBy.filter((v) => v.enabled), [dependedBy])

  const depState = useMemo(resolveDependencies, [dependencies, enabled, resolveDependencies])

  const [updateState, setUpdateState] = useState<[string, string] | null>(null)
  const [updateString, setUpdateString] = useState('')
  useEffect(() => {
    const update = ctx?.hasUpdateMods.find((v) => v.name === name)
    if (update) {
      setUpdateState([update.gb_file, update.version])
      setUpdateString(
        t('点击更新 · {newversion}', {
          newversion: update.version,
        }),
      )
    } else {
      setUpdateState(null)
    }
  }, [name, ctx.hasUpdateMods])

  const isAlwaysOn = ctx?.alwaysOnMods.includes(name)

  const [editingComment, setEditingComment] = useState(false)
  const refCommentInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editingComment) {
      refCommentInput.current?.focus()
    }
  }, [editingComment])

  return (
    <div>
      <div
        className={`flex items-center gap-x-1`}
        key={id}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span
          className={`expandBtn  ${expanded && 'expanded'} ${hasDeps && 'clickable'}`}
          onClick={() => setExpanded(!expanded)}
        >
          {hasDeps && (!optional || ctx?.fullTree) ? (
            expanded ? (
              <Icon name="i-down" />
            ) : (
              <Icon name="i-right" />
            )
          ) : (
            <Icon name="just-padding-here" />
          )}
        </span>
        <Chip
          variant="soft"
          color={isAlwaysOn ? 'accent' : enabled ? 'success' : 'default'}
          className="cursor-default"
          onClick={(e) => {
            e.preventDefault()
            ctx?.switchMod(name, !enabled)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            ctx?.switchAlwaysOn(name, !isAlwaysOn)
          }}
        >
          <Chip.Label>
            {isAlwaysOn ? t('始终开启') : enabled ? t('已启用') : t('已禁用')}
          </Chip.Label>
        </Chip>

        {enabled &&
          (depState.status === 'missing' ? (
            <Chip variant="soft" color="danger">
              <Chip.Label>{t('依赖·缺失')}</Chip.Label>
            </Chip>
          ) : depState.status === 'not-enabled' ? (
            <Chip variant="soft" color="warning">
              <Chip.Label>{t('依赖·未启用')}</Chip.Label>
            </Chip>
          ) : depState.status === 'mismatched-version' ? (
            <Chip variant="soft" color="warning">
              <Chip.Label>{t('依赖·版本不匹配')}</Chip.Label>
            </Chip>
          ) : null)}

        {hasCycle && (
          <Chip variant="soft">
            <Chip.Label>{t('循环依赖')}</Chip.Label>
          </Chip>
        )}

        {optional && (
          <Chip variant="soft" color="warning">
            <Chip.Label>{t('可选依赖')}</Chip.Label>
          </Chip>
        )}

        {dependedByFiltered.length > 0 && (
          <Chip
            variant="soft"
            color="accent"
            title={t('启用的，依赖此 Mod 的 Mod: {slot0}', {
              slot0: dependedByFiltered.map((v) => v.name).join(', '),
            })}
          >
            <Chip.Label>{dependedByFiltered.length}</Chip.Label>
          </Chip>
        )}

        {duplicateCount > 1 && (
          <Chip
            variant="soft"
            color="danger"
            title={duplicateFiles.map((v) => v.split('/').pop()).join(' | ')}
          >
            <Chip.Label>
              {duplicateCount}
              {t('次')}
            </Chip.Label>
          </Chip>
        )}

        {ctx?.showUpdate && updateState && (
          <Chip
            variant="soft"
            color="warning"
            onClick={() => {
              download.downloadMod(file.slice(0, -'.zip'.length), updateState[0], {
                onProgress: (task, progress) => {
                  setUpdateString(`${progress}% (${task.subtasks.length})`)
                },
                onFinished: () => {
                  setUpdateString(t('下载完成'))
                  reloadMods()
                },
                onFailed: (task) => {
                  console.log(task)
                  setUpdateString(t('下载失败'))
                },
                force: true,
              })
            }}
          >
            <Chip.Label>{updateString}</Chip.Label>
          </Chip>
        )}

        <span
          onClick={() => setEditingComment(true)}
          onContextMenu={(e) => {
            e.preventDefault()
            callRemote('open_url', ctx?.modFolder || '')
          }}
        >
          {name}
        </span>
        {!editingComment && ctx?.modComments[name] && (
          <span
            className="text-sm relative mb-[-0.5px] text-accent"
            onClick={() => {
              setEditingComment(true)
            }}
          >
            ({ctx?.modComments[name]})
          </span>
        )}
        {editingComment && (
          <input
            type="text"
            value={ctx?.modComments[name] ?? ''}
            ref={refCommentInput}
            className="modCommentInput"
            onInput={(e) => ctx?.setModComment(name, (e.target as any).value)}
            onKeyUp={(e) => {
              if (e.code === 'Escape' || e.code === 'Enter') {
                setEditingComment(false)
              }
            }}
            onBlur={() => setEditingComment(false)}
          />
        )}

        <ModVersionText version={version} />

        {ctx?.showDetailed && (
          <span className="modDetails">
            [{formatSize(size)} · {file}]
          </span>
        )}
        {hovered && <ModDeleteButton name={name} installedModMap={installedModMap} />}
      </div>

      {(!optional || ctx?.fullTree) && expanded && !hasCycle && (
        <div className={`space-y-0.5 mt-1 pl-6`}>
          {dependencies.map((v) => (
            <ModListItem
              key={v.id + '-' + v.name}
              {...v}
              renderPath={[...renderPath, name]}
              installedModMap={installedModMap}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ModVersionText({ version }: { version: string }) {
  return <span className="text-xs text-muted relative -mb-0.5">v{version}</span>
}

function ModDeleteButton({
  name,
  installedModMap,
}: Partial<ModInfo> & {
  installedModMap: Map<string, ModInfo>
}) {
  const { t } = useTranslation()
  const deleteMods = useDeleteMods()

  const [isOpen, setIsOpen] = useState(false)

  const [orphanedMods, setOrphanedMods] = useState<ModInfo[]>([])
  const [selectedOrphans, setSelectedOrphans] = useState<string[]>()

  const modToDelete = installedModMap.get(name)
  // Find mods that depend on this mod
  const dependentMods = modToDelete.dependedBy

  useEffect(() => {
    if (!modToDelete) {
      return
    }

    const visited = new Set<string>()

    const checkOrphans = (mod: ModInfo) => {
      if (visited.has(mod.name)) {
        return
      }
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
          setOrphanedMods((value) => {
            return [...value, depInfo]
          })
          checkOrphans(depInfo)
        }
      }
    }
    checkOrphans(modToDelete)

    setSelectedOrphans(orphanedMods.map((m) => m.name))
  }, [isOpen])

  return (
    <>
      <span
        className="text-danger"
        title={t('删除 Mod')}
        onClick={() => {
          setIsOpen(true)
        }}
      >
        <Icon name="delete" />
      </span>

      <AlertDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        message={
          <>
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
                  {orphanedMods.map((mod, idx) => (
                    <label key={mod.id + '-' + mod.name + '-' + idx} className="block">
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
          </>
        }
        title={t('删除 Mod 确认')}
        status="danger"
        onOk={() => {
          const modsToDelete = [name, ...selectedOrphans]
          deleteMods(modsToDelete)
        }}
        cancelText={t('取消')}
        okText={t('确认删除')}
      />
    </>
  )
}
