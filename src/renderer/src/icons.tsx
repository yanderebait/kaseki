// Minimal hand-rolled icon set in Tabler's outline style (24px grid, 2px
// round strokes, currentColor). Phase 1 does not yet bundle the full
// Tabler library (Part 3); these cover the few glyphs the home screen
// needs. Replace with Tabler proper when it lands.
interface IconProps {
  size?: number
  className?: string
}

function Icon({
  size = 20,
  className,
  children
}: IconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const ChevronRight = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
)

export const ArrowLeft = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
)

export const Plus = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const Download = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 11l5 5 5-5M12 4v12" />
  </Icon>
)

export const Minus = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
)

export const X = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M6 6l12 12M6 18L18 6" />
  </Icon>
)

export const Info = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v4h1" />
  </Icon>
)

export const Sidebar = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M10 4v16" />
  </Icon>
)

export const Printer = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M17 17h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2" />
    <path d="M17 9V3H7v6M7 13h10v8H7z" />
  </Icon>
)

export const Dots = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="5" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="19" r="1" fill="currentColor" />
  </Icon>
)

export const Settings = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const List = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
)

export const Grid = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <rect x="14" y="14" width="6" height="6" rx="1" />
  </Icon>
)

export const Note = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 9h8M8 13h6" />
  </Icon>
)

export const Cloud = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M7 18a4 4 0 1 1 .5-7.97A5 5 0 0 1 17 9a3.5 3.5 0 0 1 0 9H7z" />
  </Icon>
)

export const Clock = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </Icon>
)

export const Bookmark = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />
  </Icon>
)

export const Calendar = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 9h16M8 3v4M16 3v4" />
  </Icon>
)

export const Book = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM18 18H7a2 2 0 0 0-2 2" />
  </Icon>
)

export const Trash = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3" />
  </Icon>
)

export const ChevronDown = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
)

export const ChevronUp = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M6 15l6-6 6 6" />
  </Icon>
)

export const Search = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Icon>
)

export const LinkIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M9 15l6-6M10 6l.5-.5a4 4 0 0 1 6 6l-.5.5M14 18l-.5.5a4 4 0 0 1-6-6l.5-.5" />
  </Icon>
)

export const Lock = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2" />
  </Icon>
)

export const Shield = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
  </Icon>
)

export const Eye = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const Pencil = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M4 20h4l10-10a2 2 0 0 0-3-3L5 17z" />
  </Icon>
)

export const Pin = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M9 4h6M10 4v5l-2 4h8l-2-4V4M12 17v3" />
  </Icon>
)

export const AlertTriangle = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M10.3 4 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
)

export const Check = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M5 12l5 5L20 7" />
  </Icon>
)

export const Circle = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
  </Icon>
)

export const CheckCircle = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12l2.5 2.5 4.5-4.5" />
  </Icon>
)

export const Play = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M7 4v16l13-8z" />
  </Icon>
)

export const Pause = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M8 5v14M16 5v14" />
  </Icon>
)

export const Square = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </Icon>
)

export const Chart = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M4 19V11M10 19V5M16 19V13" />
    <path d="M3 20h18" />
  </Icon>
)
