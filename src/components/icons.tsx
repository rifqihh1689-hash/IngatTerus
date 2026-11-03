import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 20, ...props }: IconProps, children: ReactNode) {
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
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconHome = (p: IconProps) =>
  base(p, <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></>)
export const IconChart = (p: IconProps) =>
  base(p, <><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" rx="1" /><rect x="12" y="8" width="3" height="10" rx="1" /><rect x="17" y="5" width="3" height="13" rx="1" /></>)
export const IconUpload = (p: IconProps) =>
  base(p, <><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></>)
export const IconDownload = (p: IconProps) =>
  base(p, <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></>)
export const IconSettings = (p: IconProps) =>
  base(p, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>)
export const IconPlus = (p: IconProps) => base(p, <><path d="M12 5v14" /><path d="M5 12h14" /></>)
export const IconPlay = (p: IconProps) => base(p, <path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" />)
export const IconBack = (p: IconProps) => base(p, <path d="m15 18-6-6 6-6" />)
export const IconChevronRight = (p: IconProps) => base(p, <path d="m9 18 6-6-6-6" />)
export const IconMoon = (p: IconProps) => base(p, <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />)
export const IconSun = (p: IconProps) =>
  base(p, <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>)
export const IconMonitor = (p: IconProps) =>
  base(p, <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>)
export const IconTrash = (p: IconProps) =>
  base(p, <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>)
export const IconEdit = (p: IconProps) =>
  base(p, <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" /></>)
export const IconBell = (p: IconProps) =>
  base(p, <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>)
export const IconSearch = (p: IconProps) => base(p, <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>)
export const IconCheck = (p: IconProps) => base(p, <path d="M20 6 9 17l-5-5" />)
export const IconX = (p: IconProps) => base(p, <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>)
export const IconImage = (p: IconProps) =>
  base(p, <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>)
export const IconUndo = (p: IconProps) => base(p, <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-4" /></>)
export const IconClock = (p: IconProps) => base(p, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>)
export const IconFlame = (p: IconProps) =>
  base(p, <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.6 1.3 2.8 2.5 2.8z" />)
export const IconQuiz = (p: IconProps) =>
  base(p, <><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>)
export const IconTimer = (p: IconProps) =>
  base(p, <><path d="M10 2h4" /><path d="M12 14l3-3" /><circle cx="12" cy="14" r="8" /></>)
export const IconLayers = (p: IconProps) =>
  base(p, <><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>)
export const IconMore = (p: IconProps) =>
  base(p, <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>)
export const IconRefresh = (p: IconProps) =>
  base(p, <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>)
export const IconTarget = (p: IconProps) =>
  base(p, <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>)
export const IconFile = (p: IconProps) =>
  base(p, <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>)
