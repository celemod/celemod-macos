import { Fragment, createContext, useMemo, useContext, lazy } from 'react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { Toast } from '@heroui/react'

import Home from './routes/Home'
import { EventTarget } from './utils'
import { initMirror } from './states'
import { createModManageContext } from './context/modManage'
import { createDownloadContext } from './context/download'
import { useEverestCtx as createEverestContext } from './context/everest'
import { createBlacklistContext } from './context/blacklist'
import { NavSidebar } from './components/nav-sidebar'
import { AlertDialogProvider } from './components/alert-dialog'
const RecommendMods = lazy(() => import('./routes/RecommendMods'))
const Everest = lazy(() => import('./routes/Everest'))
const Manage = lazy(() => import('./routes/Manage'))
const Multiplayer = lazy(() => import('./routes/Multiplayer'))
const RecommendMaps = lazy(() => import('./routes/RecommendMaps'))
const Search = lazy(() => import('./routes/Search'))

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

const AppLayout = () => {
  const navigate = useNavigate()

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

  return (
    <Fragment>
      <AlertDialogProvider />
      <Toast.Provider placement="top" />
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
        <div className="flex h-screen overflow-hidden">
          <div className="h-full w-40 min-w-40 pt-10 overflow-y-auto">
            <NavSidebar />
          </div>

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
