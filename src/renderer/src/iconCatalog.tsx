import {
  IconScale,
  IconPlane,
  IconShieldCheck,
  IconHome,
  IconStethoscope,
  IconHeartbeat,
  IconHeart,
  IconDental,
  IconPaw,
  IconSchool,
  IconBooks,
  IconMicroscope,
  IconPencil,
  IconCode,
  IconBuildingBridge,
  IconBolt,
  IconDroplet,
  IconHammer,
  IconTools,
  IconCar,
  IconKey,
  IconPalette,
  IconLayout,
  IconCamera,
  IconVideo,
  IconMusic,
  IconBrush,
  IconRuler,
  IconBuildingStore,
  IconBuildingCommunity,
  IconRuler2,
  IconBriefcase,
  IconChecklist,
  IconSpeakerphone,
  IconPhone,
  IconUsers,
  IconCalculator,
  IconCoin,
  IconClipboard,
  IconBarbell,
  IconScissors,
  IconBabyCarriage,
  IconDog,
  IconSpray,
  IconChartBar,
  IconConfetti,
  IconLanguage,
  IconFeather,
  IconUser,
  IconStar,
  IconFlag,
  IconFolder,
  IconCalendar,
  IconWorld,
  IconBulb,
  IconTarget,
  IconRocket,
  IconLeaf,
  IconGift,
  IconMapPin,
  IconMug,
  type Icon
} from '@tabler/icons-react'

// Curated subset of Tabler (tree-shaken named imports). Covers every icon
// slug the presets use, plus extras for the builder's picker. Phase 1's
// hand-rolled chrome icons stay in icons.tsx; this catalog is for
// user-chosen profession/space icons.
const ICONS: Record<string, Icon> = {
  scale: IconScale,
  plane: IconPlane,
  'shield-check': IconShieldCheck,
  home: IconHome,
  stethoscope: IconStethoscope,
  heartbeat: IconHeartbeat,
  heart: IconHeart,
  dental: IconDental,
  paw: IconPaw,
  school: IconSchool,
  books: IconBooks,
  microscope: IconMicroscope,
  pencil: IconPencil,
  code: IconCode,
  'building-bridge': IconBuildingBridge,
  bolt: IconBolt,
  droplet: IconDroplet,
  hammer: IconHammer,
  tools: IconTools,
  car: IconCar,
  key: IconKey,
  palette: IconPalette,
  layout: IconLayout,
  camera: IconCamera,
  video: IconVideo,
  music: IconMusic,
  brush: IconBrush,
  ruler: IconRuler,
  'building-store': IconBuildingStore,
  'building-community': IconBuildingCommunity,
  'ruler-2': IconRuler2,
  briefcase: IconBriefcase,
  checklist: IconChecklist,
  speakerphone: IconSpeakerphone,
  phone: IconPhone,
  users: IconUsers,
  calculator: IconCalculator,
  coin: IconCoin,
  clipboard: IconClipboard,
  barbell: IconBarbell,
  scissors: IconScissors,
  'baby-carriage': IconBabyCarriage,
  dog: IconDog,
  spray: IconSpray,
  'chart-bar': IconChartBar,
  confetti: IconConfetti,
  language: IconLanguage,
  feather: IconFeather,
  user: IconUser,
  star: IconStar,
  flag: IconFlag,
  folder: IconFolder,
  calendar: IconCalendar,
  world: IconWorld,
  bulb: IconBulb,
  target: IconTarget,
  rocket: IconRocket,
  leaf: IconLeaf,
  gift: IconGift,
  'map-pin': IconMapPin,
  mug: IconMug
}

// Grouped for the builder's icon picker.
export const ICON_GROUPS: { name: string; slugs: string[] }[] = [
  {
    name: 'Work',
    slugs: ['briefcase', 'scale', 'plane', 'code', 'calculator', 'clipboard', 'checklist', 'chart-bar', 'speakerphone', 'phone', 'users', 'target', 'coin', 'shield-check']
  },
  {
    name: 'Health & care',
    slugs: ['stethoscope', 'heartbeat', 'heart', 'dental', 'paw', 'dog', 'barbell', 'baby-carriage', 'spray']
  },
  {
    name: 'Creative',
    slugs: ['palette', 'layout', 'camera', 'video', 'music', 'brush', 'pencil', 'ruler', 'confetti', 'feather']
  },
  {
    name: 'Trades & home',
    slugs: ['home', 'building-store', 'building-community', 'building-bridge', 'bolt', 'droplet', 'hammer', 'tools', 'car', 'key', 'ruler-2']
  },
  {
    name: 'Learning & life',
    slugs: ['school', 'books', 'microscope', 'language', 'world', 'bulb', 'leaf', 'user', 'star', 'flag', 'folder', 'calendar', 'gift', 'map-pin', 'mug', 'rocket', 'scissors']
  }
]

const FALLBACK = IconBriefcase

export function CatalogIcon({
  slug,
  size = 20,
  className
}: {
  slug: string | null | undefined
  size?: number
  className?: string
}): React.JSX.Element {
  const Comp = (slug && ICONS[slug]) || FALLBACK
  return <Comp size={size} stroke={2} className={className} />
}
