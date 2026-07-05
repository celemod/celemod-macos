import { Fragment } from 'react'
import { useState, useEffect } from 'react'
import { SearchList } from '../components/search-list'
import { currentMirror, initSearchSort, useGamePath, useSearchSort } from '../states'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { useRef } from 'react'
import { Content, searchSubmission } from '../api/wegfan'
import { Select, ListBox, Input, Heading } from '@heroui/react'
import { enforceEverest } from '../components/EnforceEverestPage'
import { useTranslation } from 'react-i18next'

const categoryIdMap = {
  Assets: 15655,
  Dialog: 4633,
  Effects: 1501,
  Helpers: 5081,
  Maps: 6800,
  Mechanics: 4635,
  'Other/Misc': 4632,
  Skins: 11181,
  'Twitch Integration': 4636,
  UI: 2317,
}

export default function Search() {
  const { t } = useTranslation()
  const noEverest = enforceEverest()
  if (noEverest) return noEverest

  const [mods, setMods] = useState<Content[]>([])
  const [type, setType] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [selectedPath] = useGamePath()
  const [loading, setLoading] = useState(true)
  const loadingLock = useRef(false)
  initSearchSort()
  const [sort, setSort] = useSearchSort()
  const [currentPage, setCurrentPage] = useState(1)

  const fetchModPage = async (page: number) => {
    console.log('fetching', page)
    setLoading(true)
    const res = await searchSubmission({
      page,
      // @ts-ignore
      categoryId: categoryIdMap[type],
      search,
      sort,
      // section: 'Mod',
      size: 25,
      includeExclusiveSubmissions: currentMirror() === 'wegfan',
    })
    console.log('finished, size:', res.content.length)
    setLoading(false)
    return res
  }

  useEffect(() => {
    loadingLock.current = false
  }, [mods])

  function handleSearch() {
    setMods([])
    setCurrentPage(1)
    fetchModPage(1).then((v) => {
      setMods(v.content)
    })
  }

  useEffect(handleSearch, [])

  return (
    <Fragment>
      <Heading level={1}>{t('搜索')}</Heading>
      <div className="flex items-center space-x-2 mt-2">
        <Input
          className={'grow'}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
          }}
          onKeyUp={(e) => {
            if (e.code === 'Enter') {
              handleSearch()
            }
          }}
        />
        <Button
          onClick={() => {
            handleSearch()
          }}
        >
          <Icon name="search" />
        </Button>
        <Select
          className="w-36"
          variant="secondary"
          value={type}
          onChange={(v) => setType(v as string)}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="" textValue={t('全部')}>
                {t('全部')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="Maps" textValue={t('地图')}>
                {t('地图')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="Assets" textValue={t('资源')}>
                {t('资源')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="Effects" textValue={t('特效')}>
                {t('特效')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="UI" textValue="UI">
                UI
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="Dialog" textValue={t('对话')}>
                {t('对话')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="Other/Misc" textValue={t('其他')}>
                {t('其他')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="Helpers" textValue={t('辅助')}>
                {t('辅助')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="Skins" textValue={t('皮肤')}>
                {t('皮肤')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="Mechanics" textValue={t('机制')}>
                {t('机制')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
        <Select
          className="w-36"
          variant="secondary"
          value={sort}
          onChange={(v) => setSort(v as any)}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="new" textValue={t('最近发布')}>
                {t('最近发布')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="updateAdded" textValue={t('最近添加')}>
                {t('最近添加')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="updated" textValue={t('最近更新')}>
                {t('最近更新')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="views" textValue={t('最多浏览')}>
                {t('最多浏览')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="likes" textValue={t('最多点赞')}>
                {t('最多点赞')}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <div className="mt-6">
        {mods.length > 0 ? (
          mods[0] ? (
            <SearchList
              mods={mods}
              loading={loading}
              modFolder={selectedPath + '/Mods'}
              currentPage={currentPage}
              totalPages={Math.ceil(mods.length / 25)}
              onPageChange={async (page: number) => {
                if (loadingLock.current) return
                loadingLock.current = true
                const data = await fetchModPage(page)
                setMods(data.content)
                setCurrentPage(page)
                loadingLock.current = false
              }}
            />
          ) : (
            <div>{t('加载失败，请重试')}</div>
          )
        ) : loading ? (
          <div></div>
        ) : (
          <div>{t('无内容')}</div>
        )}
      </div>
    </Fragment>
  )
}
