import i18n from 'src/i18n'
import { Fragment, createContext, useMemo, useContext } from 'react'
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Icon } from './components/Icon'
import { Toast } from '@heroui/react'

import { Search } from './routes/Search'
import { Home } from './routes/Home'
import { Manage } from './routes/Manage'
import { Multiplayer } from './routes/Multiplayer'
import { EventTarget } from './utils'
import { RecommendMods } from './routes/RecommendMods'
import { initMirror, useGamePath } from './states'
import { createModManageContext } from './context/modManage'
import { createDownloadContext } from './context/download'
import { DownloadListMenu } from './components/DownloadList'
import { useEverestCtx as createEverestContext } from './context/everest'
import { Everest } from './routes/Everest'
import { createBlacklistContext } from './context/blacklist'
import { RecommendMaps } from './routes/RecommendMaps'
import { Modal } from '@heroui/react'
import { Button } from './components/Button'

// Map page names to route paths
const PAGE_PATHS: Record<string, string> = {
  Home: '/',
  Everest: '/everest',
  Search: '/search',
  Manage: '/manage',
  Multiplayer: '/multiplayer',
  RecommendMods: '/recommend-mods',
  RecommendMaps: '/recommend-maps',
}

export const GlobalContext = createContext<{
  bus: EventTarget
  modManage: ReturnType<typeof createModManageContext>
  download: ReturnType<typeof createDownloadContext>
  everest: ReturnType<typeof createEverestContext>
  pageController: {
    setPage(name: string): void
  }
  blacklist: ReturnType<typeof createBlacklistContext>
}>({} as any)

export const useGlobalContext = () => {
  return useContext(GlobalContext)
}

const SidebarButton = ({ icon, name, title, path, currentPath }: any) => {
  const navigate = useNavigate()
  const isSelected = path === currentPath || (currentPath === '/' && path === '/')

  return (
    <button
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors w-full ${isSelected ? 'bg-accent/15 text-accent font-medium' : 'text-foreground/70 hover:bg-default/40'}`}
      onClick={() => navigate(path)}
    >
      <Icon name={icon} />
      <span className="text-sm">{title || name}</span>
    </button>
  )
}

const AppLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()

  // setup ctx states
  const modManage = createModManageContext()
  const bus = useMemo(() => new EventTarget(), [])

  const download = createDownloadContext()
  const everest = createEverestContext()
  const blacklist = createBlacklistContext()
  const pageController = {
    setPage(name: string) {
      const path = PAGE_PATHS[name] || '/'
      navigate(path)
    },
  }
  initMirror()

  const [gamePath] = useGamePath()

  const currentLang = i18n.language

  return (
    <Fragment>
      <Toast.Provider />
      {/* @ts-ignore */}
      <GlobalContext.Provider
        value={{
          bus,
          modManage,
          download,
          everest,
          pageController,
          blacklist,
        }}
      >
        <div className="flex h-screen">
          <nav className="flex flex-col gap-1 p-3 w-40 min-w-40 bg-surface overflow-y-auto">
            <SidebarButton
              icon="home"
              name="Home"
              title={i18n.t('主页')}
              path="/"
              currentPath={location.pathname}
            />
            {gamePath && (
              <Fragment>
                <SidebarButton
                  icon="chart-area"
                  name="Everest"
                  title="Everest"
                  path="/everest"
                  currentPath={location.pathname}
                />
                <SidebarButton
                  icon="search"
                  name="Search"
                  title={i18n.t('搜索')}
                  path="/search"
                  currentPath={location.pathname}
                />
                <SidebarButton
                  icon="drive"
                  name="Manage"
                  title={i18n.t('管理')}
                  path="/manage"
                  currentPath={location.pathname}
                />
                {currentLang === 'zh-CN' && (
                  <SidebarButton
                    icon="web"
                    name="Multiplayer"
                    title={i18n.t('联机相关')}
                    path="/multiplayer"
                    currentPath={location.pathname}
                  />
                )}
                <SidebarButton
                  icon="flag"
                  name="RecommendMods"
                  title={i18n.t('推荐模组')}
                  path="/recommend-mods"
                  currentPath={location.pathname}
                />
                <SidebarButton
                  icon="image"
                  name="RecommendMaps"
                  title={i18n.t('推荐地图')}
                  path="/recommend-maps"
                  currentPath={location.pathname}
                />
              </Fragment>
            )}

            <div className="mt-auto flex justify-center py-2"></div>
            <Modal>
              <Button type="default">
                <Icon name="download" />
              </Button>

              <Modal.Backdrop>
                <Modal.Container placement="top">
                  <Modal.Dialog>
                    <Modal.Body>
                      <DownloadListMenu />
                    </Modal.Body>
                  </Modal.Dialog>
                </Modal.Container>
              </Modal.Backdrop>
            </Modal>
          </nav>

          <div className="flex-1 overflow-y-auto p-3">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/everest" element={<Everest />} />
              <Route path="/search" element={<Search />} />
              <Route path="/manage" element={<Manage />} />
              <Route path="/multiplayer" element={<Multiplayer />} />
              <Route path="/recommend-mods" element={<RecommendMods />} />
              <Route path="/recommend-maps" element={<RecommendMaps />} />
            </Routes>
          </div>
        </div>
      </GlobalContext.Provider>
    </Fragment>
  )
}

export default () => (
  <MemoryRouter>
    <AppLayout />
  </MemoryRouter>
)
