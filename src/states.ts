import { create } from 'zustand'
import { ModBlacklistProfile } from './ipc/blacklist'
import { useEffect, useState } from 'react'
import { callRemote } from './utils'
import { Store } from '@tauri-apps/plugin-store'

export const useCurrentBlacklistProfile = create<{
  currentProfileName: string
  setCurrentProfileName: (currentProfileName: string) => void
  profiles: ModBlacklistProfile[]
  setProfiles: (profiles: ModBlacklistProfile[]) => void
  setProfilesCallback: (setter: (profiles: ModBlacklistProfile[]) => ModBlacklistProfile[]) => void
  currentProfile: ModBlacklistProfile | null
  setCurrentProfile: (currentProfile: ModBlacklistProfile | null) => void
}>((set) => ({
  currentProfileName: '',
  setCurrentProfileName: (currentProfileName: string) => set({ currentProfileName }),
  profiles: [],
  setProfiles: (profiles: ModBlacklistProfile[]) => set({ profiles }),
  currentProfile: null,
  setCurrentProfile: (currentProfile: ModBlacklistProfile | null) => set({ currentProfile }),
  setProfilesCallback: (setter: (profiles: ModBlacklistProfile[]) => ModBlacklistProfile[]) =>
    set((states) => {
      const newProfiles = setter(states.profiles)
      return { profiles: newProfiles }
    }),
}))

declare global {
  var configStorage: any
  var storage: any
  var env: any
  var sys: any
}

interface StorageHandle {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<void>
  save: () => Promise<void>
  ready: boolean
}

export const useStorage = (): StorageHandle => {
  const [ready, setReady] = useState(false)
  const [store, setStore] = useState<Store>()

  useEffect(() => {
    Store.load('config.json').then((st) => {
      setStore(st)
      setReady(true)
    })
  }, [])

  return {
    get: async (key: string) => {
      if (!store) return
      return await store?.get(key)
    },
    set: async (key: string, value: any) => {
      if (!store) return
      await store?.set(key, value)
    },
    save: async () => {
      if (!store) return
      await store?.save()
    },
    ready,
  }
}

export interface BackendDep {
  name: string
  version: string
  optional: boolean
}

export interface BackendModInfo {
  game_banana_id: string
  name: string
  deps: BackendDep[]
  version: string
  file: string
  size: number
}

const useInstalledModsStore = create<{
  installedMods: BackendModInfo[]
  setInstalledMods: (installedMods: BackendModInfo[]) => void
}>((set) => ({
  installedMods: [],
  setInstalledMods: (installedMods: BackendModInfo[]) => set({ installedMods }),
}))

export function useInstalledMods() {
  const { installedMods, setInstalledMods } = useInstalledModsStore()
  const modsPaths = useModsPath()

  function reloadMods() {
    callRemote('get_installed_mods', modsPaths).then((mods: BackendModInfo[]) => {
      setInstalledMods(mods)
    })
  }

  return {
    installedMods,
    setInstalledMods,
    reloadMods,
  }
}

export const useCurrentEverestVersion = create<{
  currentEverestVersion: string
  setCurrentEverestVersion: (currentEverestVersion: string) => void
}>((set) => ({
  currentEverestVersion: '',
  setCurrentEverestVersion: (currentEverestVersion: string) => set({ currentEverestVersion }),
}))

export const useCurrentLang = create<{
  currentLang: string
  setCurrentLang: (currentLang: string) => void
}>((set) => ({
  currentLang: '',
  setCurrentLang: (currentLang: string) => set({ currentLang }),
}))

function createPersistedState<T>(
  initial: T,
  getFn: (storage: StorageHandle) => T | Promise<T>,
  setFn: (storage: StorageHandle, data: T) => Promise<void>,
) {
  const useTheState = create<{
    value: T
    set: (value: T) => void
  }>((set) => ({
    value: initial,
    set(value) {
      set({ value })
    },
  }))

  let refValue = initial

  return [
    () => {
      const { set: setData } = useTheState()
      const st = useStorage()

      useEffect(() => {
        ;(async () => {
          if (!st.ready) return
          const data = await getFn(st)
          refValue = data
          if (data !== undefined && data !== null) {
            setData(data as any)
          }
        })()
      }, [st.ready])
    },
    (): [T, (data: T) => void] => {
      const { value, set: setData } = useTheState()
      const st = useStorage()
      return [
        value,
        (data) => {
          refValue = data
          setData(data)
          if (st.ready) {
            setFn(st, data)
          } else {
            setTimeout(async () => {
              if (st.ready) {
                await setFn(st, data)
              }
            }, 10)
          }
        },
      ]
    },
    () => refValue,
  ] as [() => void, () => [T, (data: T) => void], () => T]
}

const createPersistedStateByKey = <T>(key: string, defaultValue: T) =>
  createPersistedState<T>(
    defaultValue,
    async (st) => {
      const val = await st.get(key)
      return val ?? defaultValue
    },
    async (st, data) => {
      await st.set(key, data)
      await st.save()
    },
  )

export const [initMirror, useMirror, currentMirror] = createPersistedStateByKey('mirror', 'wegfan')
export const [initGamePath, useGamePath] = createPersistedState<string>(
  '',
  async (st) => {
    const storedPath = await st.get('lastGamePath')
    if (storedPath) {
      try {
        return await callRemote('normalize_game_path_cmd', storedPath)
      } catch {
        return storedPath
      }
    }
    try {
      const paths = (await callRemote('get_celeste_dirs')) as string[]
      return paths[0] || ''
    } catch {
      return ''
    }
  },
  async (st, data) => {
    await st.set('lastGamePath', data)
    await st.save()
  },
)
export function useModsPath() {
  const [gamePath] = useGamePath()
  return gamePath + '/Mods'
}

export const [initUseMultiThread, useUseMultiThread] = createPersistedStateByKey(
  'useMultiThread',
  false,
)

export const [initAlwaysOnMods, useAlwaysOnMods] = createPersistedStateByKey('alwaysOnMods', [])

export const [initSearchSort, useSearchSort] = createPersistedStateByKey<
  'new' | 'updateAdded' | 'updated' | 'views' | 'likes'
>('searchSort', 'likes')

export const [initAutoDisableNewMods, useAutoDisableNewMods] = createPersistedStateByKey(
  'autoDisableNewMods',
  false,
)

export const [initModComments, useModComments] = createPersistedStateByKey('modComments', {})
