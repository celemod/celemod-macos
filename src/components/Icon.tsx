import {
  Home,
  AreaChart,
  Search,
  HardDrive,
  Globe,
  Flag,
  Image as ImageIcon,
  Download,
  AlertTriangle,
  Trash2,
  ChevronDown,
  ChevronRight,
  Circle,
  Minus,
  Maximize,
  X,
  Edit,
  File,
  Check,
  Grid3x3,
  Clock,
  Save,
  LoaderPinwheel,
  Loader,
  type LucideIcon,
} from 'lucide-react'

const iconMap: Record<string, LucideIcon> = {
  home: Home,
  'chart-area': AreaChart,
  search: Search,
  drive: HardDrive,
  web: Globe,
  flag: Flag,
  image: ImageIcon,
  download: Download,
  warn: AlertTriangle,
  delete: Trash2,
  'i-down': ChevronDown,
  'i-right': ChevronRight,
  'i-asterisk': Circle,
  minus: Minus,
  landscape: Maximize,
  cancel: X,
  edit: Edit,
  file: File,
  checkmark: Check,
  grid: Grid3x3,
  clock: Clock,
  save: Save,
  loaderPinwheel: LoaderPinwheel,
  loader: Loader,
}

export const Icon = ({
  name,
  size = 16,
  className = '',
}: {
  name: string
  size?: number
  className?: string
}) => {
  const LucideIcon = iconMap[name]
  if (!LucideIcon) {
    return <span className={`inline-block ${className}`} style={{ width: size, height: size }} />
  }
  return <LucideIcon size={size} className={className} />
}
