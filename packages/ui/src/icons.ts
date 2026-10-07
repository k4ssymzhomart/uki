// The 93 Figma icons (Icons page 1:63) mapped to lucide-react. Components import icons only from here.
// The Figma set is drawn in a house style, not by Lucide, so every entry is the nearest Lucide glyph.
// Where Lucide has no exact match the line says "closest" and what differs.
// Checked against the Figma Icons page and the icon/check (7:90) export on 7 Oct 2026.
import {
  AppWindow,
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Building2,
  Calculator,
  Calendar,
  ChartColumn,
  ChartPie,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  CircleDot,
  CirclePause,
  CircleQuestionMark,
  Clipboard,
  ClipboardCheck,
  CloudOff,
  Code,
  Copy,
  Cpu,
  Database,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  FileText,
  Flag,
  Funnel,
  Globe,
  GlobeLock,
  GraduationCap,
  Hand,
  History,
  IdCard,
  Inbox,
  Info,
  Key,
  Keyboard,
  LaptopMinimal,
  LayoutGrid,
  Link,
  ListChecks,
  LockKeyhole,
  LockOpen,
  LogOut,
  type LucideIcon,
  Mail,
  Menu,
  MessageSquare,
  Mic,
  Minus,
  Monitor,
  Moon,
  Pencil,
  PhoneOff,
  Play,
  Plug,
  Plus,
  Printer,
  Puzzle,
  RefreshCw,
  ScanFace,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Square,
  SquareArrowUpRight,
  Sun,
  Timer,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Upload,
  User,
  UserPlus,
  Users,
  Webcam,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

export type { LucideIcon };

export const icons = {
  gaze: CircleDot, // closest: Figma draws an eyeball (ring with a filled pupil); Lucide's dot is smaller
  "gaze-away": EyeOff, // closest: Figma draws the eyeball looking left with motion marks; Lucide has no such glyph
  eyes: Eye, // closest: Figma draws two eyeballs side by side
  camera: Webcam,
  "face-scan": ScanFace,
  "id-card": IdCard,
  phone: Smartphone,
  "phone-off": PhoneOff, // closest: Figma crosses out a smartphone; Lucide 1.x only crosses out a handset
  "browser-lock": GlobeLock, // closest: Figma draws a browser window with a padlock
  "tab-switch": Copy, // closest: Figma draws two overlapping rounded squares, mirrored from Lucide's copy glyph
  lock: LockKeyhole,
  shield: ShieldCheck, // Figma draws this one with a tick, the same glyph as shield-check
  exam: ClipboardCheck,
  timer: Timer,
  report: FileText, // Figma draws the same document-with-lines glyph as file-text
  flag: Flag,
  alert: TriangleAlert,
  check: CircleCheck, // Figma icon/check is a circled tick (see .figma-cache/79-2410/check.svg)
  pause: CirclePause,
  offline: WifiOff,
  mic: Mic,
  screen: Monitor,
  user: User,
  users: Users,
  settings: Settings2, // closest: Figma's two sliders put the knobs the other way round
  "layout-grid": LayoutGrid,
  calendar: Calendar,
  upload: Upload,
  download: Download,
  search: Search,
  filter: Funnel,
  bell: Bell,
  "log-out": LogOut,
  plus: Plus,
  more: Ellipsis,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  "arrow-right": ArrowRight,
  "external-link": SquareArrowUpRight, // Figma closes the square around the arrow
  "eye-off": EyeOff,
  play: Play,
  stop: Square, // closest: Figma draws a smaller rounded square than "square"
  refresh: RefreshCw,
  copy: Copy,
  globe: Globe,
  chip: Cpu,
  message: MessageSquare,
  edit: Pencil,
  history: History,
  info: Info,
  help: CircleQuestionMark,
  puzzle: Puzzle,
  link: Link,
  key: Key,
  unlock: LockOpen,
  clipboard: Clipboard,
  printer: Printer,
  keyboard: Keyboard,
  "app-window": AppWindow,
  wifi: Wifi,
  hand: Hand,
  code: Code,
  "bar-chart": ChartColumn, // closest: Figma has a baseline only, no vertical axis
  "trend-up": TrendingUp,
  "pie-chart": ChartPie,
  database: Database,
  archive: Archive,
  trash: Trash2,
  "file-text": FileText,
  building: Building2,
  sliders: SlidersHorizontal,
  "list-check": ListChecks,
  "user-plus": UserPlus,
  mail: Mail,
  moon: Moon,
  sun: Sun,
  plug: Plug,
  "shield-check": ShieldCheck,
  "graduation-cap": GraduationCap,
  "cloud-off": CloudOff,
  laptop: LaptopMinimal,
  "chevron-left": ChevronLeft,
  "chevron-up": ChevronUp,
  close: X,
  calculator: Calculator,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  sort: ArrowUpDown,
  send: Send,
  minus: Minus,
  square: Square,
  inbox: Inbox,
  menu: Menu,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

/** Every icon name, in the order of the Figma Icons page. */
export const iconNames = Object.keys(icons) as IconName[];

/**
 * Glyphs drawn inside controls that are not on the Icons page.
 * tick: the Checkbox tick (Figma 49:2176), a plain check without the circle of icon/check.
 */
export const glyphs = {
  tick: Check,
} as const satisfies Record<string, LucideIcon>;

/** Figma draws every icon at 24 px with a 2 px stroke. */
export const ICON_SIZE = 24;
export const ICON_STROKE = 2;

/** The Checkbox tick is 14 px with a 1.925 px stroke in Figma: 3.3 on Lucide's 24 px grid. */
export const TICK_STROKE = 3.3;
