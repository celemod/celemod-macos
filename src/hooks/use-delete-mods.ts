import { useGamePath, useInstalledMods } from 'src/states'
import { callRemote } from 'src/utils'

export function useDeleteMods() {
  const { reloadMods } = useInstalledMods()
  const [gamePath] = useGamePath()

  return (mods: string[]) => {
    callRemote('delete_mods', gamePath, mods).then(() => {
      reloadMods()
    })
  }
}
