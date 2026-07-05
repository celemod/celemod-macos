import { useTranslation } from 'react-i18next'
import { Icon } from '../components/Icon'
import { useLocation, useNavigate } from 'react-router-dom'
import { useGamePath } from 'src/states'
import { DownloadListPopover } from './DownloadList'

export function NavSidebar() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const [gamePath] = useGamePath()

  const currentLang = i18n.language

  return (
    <nav className="flex flex-col gap-1 p-3 h-full">
      <SidebarButton
        icon="home"
        name="Home"
        title={t('主页')}
        path="/"
        currentPath={location.pathname}
      />
      {gamePath && (
        <>
          <SidebarButton
            icon="mountain-snow"
            name="Everest"
            title="Everest"
            path="/everest"
            currentPath={location.pathname}
          />
          <SidebarButton
            icon="search"
            name="Search"
            title={t('搜索')}
            path="/search"
            currentPath={location.pathname}
          />
          <SidebarButton
            icon="drive"
            name="Manage"
            title={t('管理')}
            path="/manage"
            currentPath={location.pathname}
          />
          {currentLang === 'zh-CN' && (
            <SidebarButton
              icon="web"
              name="Multiplayer"
              title={t('联机相关')}
              path="/multiplayer"
              currentPath={location.pathname}
            />
          )}
          <SidebarButton
            icon="flag"
            name="RecommendMods"
            title={t('推荐模组')}
            path="/recommend-mods"
            currentPath={location.pathname}
          />
          <SidebarButton
            icon="image"
            name="RecommendMaps"
            title={t('推荐地图')}
            path="/recommend-maps"
            currentPath={location.pathname}
          />
        </>
      )}

      <div className="mt-auto flex justify-center py-2"></div>

      <DownloadListPopover />
    </nav>
  )
}

function SidebarButton({ icon, name, title, path, currentPath, isLoading }: any) {
  const navigate = useNavigate()
  const isSelected = path === currentPath || (currentPath === '/' && path === '/')

  return (
    <button
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors w-full ${isSelected ? 'bg-accent/15 text-accent font-medium' : 'text-foreground/70 hover:bg-default/40'}`}
      onClick={() => navigate(path)}
    >
      <Icon name={icon} />
      <span className="text-sm">{title || name}</span>
      {isLoading && <Icon name="loader" />}
    </button>
  )
}
