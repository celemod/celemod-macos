import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'

// Simple dirname replacement (no Node.js path module needed in browser/tauri)
const dirname = (p: string) => {
  const idx = p.lastIndexOf('/')
  return idx >= 0 ? p.substring(0, idx) : '.'
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Async Tauri IPC bridge.
 * All Tauri commands are async - returns a Promise.
 * For commands that previously used callbacks, use listenProgress().
 */
export const callRemote = async (name: string, ...args: any[]) => {
  // Strip trailing callback function (old Sciter callback pattern, now replaced by events)
  if (args.length > 0 && typeof args[args.length - 1] === 'function') {
    console.warn(`callRemote ${name}: callback argument ignored, use listenProgress() instead`)
    args = args.slice(0, -1)
  }

  // No args — just invoke with no payload
  if (args.length === 0) {
    return await invoke(name)
  }

  // Build an object of named parameters matching the Rust function's parameter names.
  // Tauri auto-converts camelCase JS property names to snake_case Rust parameter names.
  const paramNames = getParamNames(name)
  const params: Record<string, any> = {}
  for (let i = 0; i < args.length && i < paramNames.length; i++) {
    params[paramNames[i]] = args[i]
  }
  return await invoke(name, params)
}

// Map of command names to their parameter names (used for positional→named conversion)
function getParamNames(command: string): string[] {
  const paramMap: Record<string, string[]> = {
    download_mod: ['name', 'url', 'modsDir', 'autoDisableNewMods', 'multiThread'],
    cancel_download_mod: ['name'],
    get_installed_mods: ['modsFolderPath'],
    get_installed_mod_ids: ['modsFolderPath'],
    get_invalid_zip_mod_files_cmd: ['modsFolderPath'],
    check_all_mod_contents: ['modsFolderPath'],
    get_installed_miaonet: ['modsFolderPath'],
    get_blacklist_profiles: ['gamePath'],
    apply_blacklist_profile: ['gamePath', 'profileName', 'alwaysOnMods'],
    switch_mod_blacklist_profile: ['gamePath', 'profileName', 'modNames', 'modFiles', 'enabled'],
    new_mod_blacklist_profile: ['gamePath', 'profileName'],
    get_current_profile: ['gamePath'],
    remove_mod_blacklist_profile: ['gamePath', 'profileName'],
    get_mod_update: ['name'],
    delete_mods: ['gamePath', 'modNames'],
    delete_mod_files: ['modsFolderPath', 'fileNames'],
    get_everest_version: ['gamePath'],
    download_and_install_everest: ['gamePath', 'url'],
    open_url: ['url'],
    verify_celeste_install: ['path'],
    normalize_game_path_cmd: ['path'],
    get_current_blacklist_content: ['gamePath'],
    sync_blacklist_profile_from_file: ['gamePath', 'profileName'],
    set_mod_options_order: ['gamePath', 'profileName', 'order'],
    start_game: ['path'],
    start_game_directly: ['path', 'origin'],
    rm_mod: ['modsFolderPath', 'modName'],
  }
  return paramMap[command] || []
}

/**
 * Listen for progress events from the Rust backend.
 * Returns an unlisten function to be called on cleanup.
 */
export const listenProgress = <T>(
  eventName: string,
  callback: (payload: T) => void,
): Promise<UnlistenFn> => {
  return listen<T>(eventName, (event) => {
    callback(event.payload)
  })
}

/**
 * Get app version asynchronously
 */
let _cachedVersion: string | null = null
export const getCelemodVersion = async (): Promise<string> => {
  if (!_cachedVersion) {
    _cachedVersion = (await callRemote('celemod_version')) as string
  }
  return _cachedVersion!
}

/**
 * Get app git hash asynchronously
 */
let _cachedHash: string | null = null
export const getCelemodHash = async (): Promise<string> => {
  if (!_cachedHash) {
    _cachedHash = (await callRemote('celemod_hash')) as string
  }
  return _cachedHash!
}

/**
 * Get user agent string asynchronously
 */
export const getCelemodUA = async (): Promise<string> => {
  const [version, hash] = await Promise.all([getCelemodVersion(), getCelemodHash()])
  return `CeleMod/${version}-${hash.substr(0, 6)}`
}

export class EventTarget {
  listeners: { [key: string]: Function[] } = {}
  addEventListener(name: string, cb: Function) {
    if (!this.listeners[name]) this.listeners[name] = []
    this.listeners[name].push(cb)
  }
  on(name: string, cb: Function) {
    this.addEventListener(name, cb)
  }
  removeEventListener(name: string, cb: Function) {
    if (!this.listeners[name]) return
    this.listeners[name] = this.listeners[name].filter((v) => v !== cb)
  }
  remove(name: string, cb: Function) {
    this.removeEventListener(name, cb)
  }
  dispatchEvent(name: string, ...args: any[]) {
    if (!this.listeners[name]) return
    this.listeners[name].forEach((cb) => cb(...args))
  }
}

// polyfill for URLSearchParams
export class URLSearchParams {
  private params: Map<string, string> = new Map()
  constructor(init?: string | { [key: string]: string | string[] }) {
    if (typeof init === 'string') {
      init.split('&').forEach((v) => {
        const [k, v_] = v.split('=')
        this.params.set(k, v_)
      })
    } else if (init) {
      Object.entries(init).forEach(([k, v]) => {
        this.params.set(k, v.toString())
      })
    }
  }
  set(key: string, value: string) {
    this.params.set(key, value)
  }
  toString() {
    return [...this.params.entries()]
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
  }
}

export const displayDate = (date_: string | Date) => {
  const date = new Date(date_)
  const pad = (v: number) => v.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// if a > b, return 1 else -1, 0 if equal
export const compareVersion = (a: string, b: string) => {
  const aParts = a.split('.')
  const bParts = b.split('.')
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || '0'
    const bPart = bParts[i] || '0'
    if (aPart === bPart) {
      continue
    }
    return parseInt(aPart) > parseInt(bPart) ? 1 : -1
  }
  return 0
}

export const selectGamePath = async (successCallback: (path: string) => void) => {
  const platform = (window as any).__TAURI__?.os?.platform
    ? await (window as any).__TAURI__?.os?.platform()
    : navigator.platform

  const isWindows = typeof platform === 'string' && platform.toLowerCase().startsWith('win')

  const selected = await open({
    multiple: false,
    filters: [
      {
        name: 'Celeste',
        extensions: isWindows ? ['exe'] : ['*'],
      },
    ],
    title: 'Select Celeste Game',
  })

  if (selected) {
    // Strip filename to get directory
    const filePath = selected as string
    const decoded = decodeURI(filePath)
    const dirPath = dirname(decoded)
    const path = await callRemote('normalize_game_path_cmd', dirPath)
    const valid = await callRemote('verify_celeste_install', path)
    if (!valid) {
      alert('Invalid Celeste install path.')
      return
    }
    console.log('Selected', path)
    successCallback(path as string)
    return path
  }
}

export type Awaitable<T> = T | Promise<T>

export const horizontalScrollMouseWheelHandler =
  (smooth = true) =>
  (e: any) => {
    if (e.deltaY === 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.scrollTo({
      left: e.currentTarget.scrollLeft + e.deltaY * 2,
      behavior: smooth ? 'smooth' : 'instant',
    })
  }
