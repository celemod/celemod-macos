import { useContext, useEffect, useState } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'
import { callRemote } from '../utils'

import { Content } from '../api/wegfan'
import { Download } from '../context/download'
import { useAutoDisableNewMods } from '../states'
import { useGlobalContext } from '../App'
import { PopupContext, createPopup } from './Popup'
import { ProgressIndicator } from './Progress'
import { Card, Button as HeroButton, Modal, Heading, Description } from '@heroui/react'
import sanitizeHtml from 'sanitize-html'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const processLargeNum = (num: number) => {
  if (num < 1000) return num.toString()
  if (num < 1000000) return (num / 1000).toFixed(1) + 'k'
  if (num < 1000000000) return (num / 1000000).toFixed(1) + 'm'
  return (num / 1000000000).toFixed(1) + 'b'
}

interface ModDetailInfo {
  description: string
  authors?: string[]
  images?: string[]
  files?: {
    name: string
    downloadUrl: string
  }[]
  lastUpdate?: Date
  externalUrl?: string
}

interface FileToDownload {
  name: string
  url: string
  id: string
  size: string
}

interface ModInfo {
  name: string
  downloadUrl: () => Promise<string | FileToDownload[]>
  previewUrl: string
  author: string
  isInstalled: boolean
  other: string
  detail?: () => Promise<ModDetailInfo>
}

export const SearchModItem = (props: {
  mod: ModInfo
  onClick?: any
  expanded?: boolean
  modFolder: string
  isInstalled: boolean
}) => {
  const { t } = useTranslation()
  const { download, modManage } = useGlobalContext()
  const [autoDisableNewMods] = useAutoDisableNewMods()
  const { mod } = props

  const [downloadTask, setDownloadTask] = useState<Download.TaskInfo | null>(null)

  return (
    <Card>
      <img src={mod.previewUrl + '?w=340'} alt="" className="rounded-xl" />

      <div>
        <Heading level={6}>{mod.name}</Heading>
        <Description>{mod.author}</Description>
        <Card.Description>{mod.other}</Card.Description>
      </div>

      <div>
        <div className="inline-flex items-center gap-x-1">
          <Button
            onClick={async () => {
              if (downloadTask) return

              const down = async (name: string, fileid: string) => {
                setDownloadTask(
                  await download.downloadMod(name, fileid, {
                    autoDisableNewMods,
                    onProgress: (task) => setDownloadTask({ ...task }),
                    onFailed: (task) => setDownloadTask({ ...task }),
                    onFinished: (task) => {
                      setDownloadTask({ ...task })
                      modManage.reloadMods()
                    },
                  }),
                )
              }

              let ctx: any
              createPopup(() => {
                const popupCtx = useContext(PopupContext)
                const [downloads, setDownloads] = useState<FileToDownload[] | null>(null)
                const [error, setError] = useState<string | null>(null)
                ctx = {
                  hide() {
                    popupCtx.hide()
                  },
                  setDownloads(data: any) {
                    setDownloads(data)
                  },
                  setError(data: any) {
                    setError(data)
                  },
                }

                if (downloads === null && error === null)
                  return (
                    <div
                      style={{
                        width: 'min-content',
                      }}
                    >
                      <ProgressIndicator infinite />
                    </div>
                  )

                return (
                  <div
                    className="download-file-popup space-y-8"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) ctx.hide()
                    }}
                  >
                    {downloads &&
                      downloads
                        .map((v) => {
                          console.log(downloads)
                          return (
                            <div className="file">
                              <div>ID: {v.id}</div>
                              <div>Name: {v.name}</div>
                              <div>Size: {v.size}</div>

                              <Button
                                onClick={() => {
                                  down(v.name, parseInt(v.id) === -1 ? v.url : v.id)
                                  popupCtx.hide()
                                }}
                              >
                                <Icon name="download" />
                              </Button>
                            </div>
                          )
                        })
                        .reduce((pre: any[], cur) => {
                          // group by 3
                          if (pre.length === 0) return [[cur]]
                          if (pre[pre.length - 1].length === 2) return [...pre, [cur]]
                          pre[pre.length - 1].push(cur)
                          return pre
                        }, [])
                        .map((v) => <div className="group space-y-1">{v}</div>)}

                    <span>{error}</span>
                  </div>
                )
              })

              const downloadInfo = await mod.downloadUrl()

              if (typeof downloadInfo === 'string') {
                ctx.hide()
                down(mod.name, downloadInfo)
              } else {
                if (downloadInfo.length === 1) {
                  ctx.hide()
                  down(downloadInfo[0].name, downloadInfo[0].id)
                } else if (downloadInfo.length === 0) {
                  ctx.setError(t('文件列表为空'))
                } else {
                  ctx.setDownloads(downloadInfo)
                }
              }
            }}
          >
            {props.isInstalled ? (
              <Icon name="checkmark" />
            ) : downloadTask ? (
              downloadTask.state === 'pending' ? (
                `${downloadTask.progress}% (${downloadTask.subtasks.filter((v) => v.state !== 'Finished').length})`
              ) : downloadTask.state === 'failed' ? (
                <Icon name="cancel" />
              ) : (
                <Icon name="checkmark" />
              )
            ) : (
              <Icon name="download" />
            )}
          </Button>

          {props.mod.detail && <DetailButton mod={props.mod} />}
        </div>
      </div>
    </Card>
  )
}

function DetailButton({ mod }) {
  const [data, setData] = useState<ModDetailInfo | null>(null)

  useEffect(() => {
    mod?.detail?.()?.then((value) => {
      setData(value)
    })
  }, [])

  if (!data) {
    return 'no content'
  }

  return (
    <Modal>
      <Button>Details</Button>

      <Modal.Backdrop>
        <Modal.Container size="cover">
          <Modal.Dialog>
            <Modal.Body className="space-y-4">
              <div className="space-y-2">
                {data.images?.map?.((src) => (
                  <img key={src} src={src} alt="" className="rounded-xl" />
                ))}
              </div>
              <div>
                {data.files?.map((file) => (
                  <div key={file.name}>
                    {file.name}: {file.downloadUrl}
                  </div>
                ))}
              </div>
              <div>
                <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.description) }}></p>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

function NoInstalledMods() {
  return (
    <div
      className="loader"
      style={{ position: 'fixed', bottom: 200, height: 24, left: 200, right: 200 }}
    >
      <div className="bar"></div>
    </div>
  )
}

function HasInstalledMods({ installedModIDs, loading, props }) {
  const ITEMS_PER_PAGE = 24
  const totalPages = Math.max(1, Math.ceil(props.mods.length / ITEMS_PER_PAGE))
  const [page, setPage] = useState(1)
  const startIdx = (page - 1) * ITEMS_PER_PAGE
  const endIdx = startIdx + ITEMS_PER_PAGE
  const pageMods = props.mods.slice(startIdx, endIdx)

  useEffect(() => {
    if (props.onPageChange) {
      props.onPageChange(page)
    }
  }, [page])

  const formatSize = (size: number) => {
    const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024))
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    return `${(size / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
  }

  return (
    <div>
      <div className="space-y-2">
        {pageMods.map((mod2: Content) => {
          const mod = {
            name: mod2.name,
            downloadUrl: () => {
              const dedup = new Set()
              if (!mod2.gameBananaId) return mod2.files[0].url
              return Promise.resolve(
                mod2.files
                  .filter((v) => {
                    if (v.mods.length === 0) return false
                    if (dedup.has(v.mods[0].id)) return false
                    dedup.add(v.mods[0].id)
                    return true
                  })
                  .map(
                    (v) =>
                      ({
                        id: v.gameBananaId.toString(),
                        name: `${v.description.includes(v.mods[0].version) ? '' : v.mods[0].version + '-'}${v.description}-${v.mods[0].name}`,
                        size: formatSize(v.size),
                        url: v.url,
                      }) as FileToDownload,
                  ),
              )
            },
            previewUrl: mod2?.screenshots?.[0]?.url ?? '/Celemod.png',
            author: mod2.submitter,
            isInstalled: installedModIDs.includes(mod2.gameBananaId?.toString()),
            other: `${mod2.likes} 🥰 · ${processLargeNum(mod2.views)} 👀 · ${processLargeNum(mod2.downloads)} 💾`,
            detail: () =>
              Promise.resolve({
                description: mod2.description,
                authors: mod2.credits.map((v) => v.authors.map((v) => v.name)).flat(),
                images: mod2.screenshots.map((v) => v.url),
                files: mod2.files.map((v) => ({ name: v.description, downloadUrl: v.url })),
                lastUpdate: mod2.latestUpdateAddedTime,
                externalUrl: mod2.pageUrl,
              }),
          }

          return (
            <SearchModItem
              key={mod.name}
              // @ts-ignore
              mod={mod}
              modFolder={props.modFolder}
              isInstalled={mod.isInstalled}
            />
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-4">
          <HeroButton
            variant="secondary"
            size="sm"
            isDisabled={page <= 1}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft />
          </HeroButton>
          <span className="text-sm text-muted px-2">
            {page} / {totalPages}
          </span>
          <HeroButton
            variant="secondary"
            size="sm"
            isDisabled={page >= totalPages}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight />
          </HeroButton>
        </div>
      )}

      {loading && (
        <div className="loader" style={{ position: 'fixed', bottom: 0, height: 24, zIndex: 999 }}>
          <div className="bar"></div>
        </div>
      )}
    </div>
  )
}

export const SearchList = (props: {
  mods: Content[]
  modFolder: string
  loading?: boolean
  currentPage?: number
  totalPages?: number
  onPageChange?: (page: number) => void
}) => {
  const [loading, setLoading] = useState(true)
  const [installedModIDs, setInstalledModIDs] = useState<string[] | null>(null)

  useEffect(() => {
    callRemote('get_installed_mod_ids', props.modFolder).then((ids: string[]) => {
      setInstalledModIDs(ids)
    })
  }, [props.modFolder])

  useEffect(() => {
    setLoading(props.loading ?? false)
  }, [props.loading])

  if (installedModIDs === null) {
    return <NoInstalledMods />
  }

  return <HasInstalledMods installedModIDs={installedModIDs} loading={loading} props={props} />
}
