// @coms-portal/ui/primitives
// 15 shadcn-svelte v3 primitive families lifted from @coms/web (Heroes).
//
// Each family is re-exported using its fully-qualified name alias to avoid
// collisions between generic short names (Root, Content, Header…) that are
// shared across multiple families. The named aliases (Avatar, Button, CardContent,
// DialogContent, etc.) are unique across all families and safe to flatten.

// ── Avatar ──────────────────────────────────────────────────────────────────
export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
} from './avatar/index.js'

// ── Badge ───────────────────────────────────────────────────────────────────
export { Badge, badgeVariants, type BadgeVariant } from './badge/index.js'

// ── Button ──────────────────────────────────────────────────────────────────
export {
  Button,
  buttonVariants,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from './button/index.js'

// ── Card ────────────────────────────────────────────────────────────────────
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from './card/index.js'

// ── Dialog ──────────────────────────────────────────────────────────────────
export {
  Dialog,
  DialogTitle,
  DialogPortal,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
  DialogOverlay,
  DialogContent,
  DialogDescription,
  DialogClose,
} from './dialog/index.js'

// ── DropdownMenu ─────────────────────────────────────────────────────────────
export {
  DropdownMenu,
  DropdownMenuCheckboxGroup,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuGroupHeading,
} from './dropdown-menu/index.js'

// ── Input ───────────────────────────────────────────────────────────────────
export { Input } from './input/index.js'

// ── Label ───────────────────────────────────────────────────────────────────
export { Label } from './label/index.js'

// ── Select ──────────────────────────────────────────────────────────────────
export {
  Select,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectContent,
  SelectTrigger,
  SelectSeparator,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectGroupHeading,
  SelectPortal,
} from './select/index.js'

// ── Separator ───────────────────────────────────────────────────────────────
export { Separator } from './separator/index.js'

// ── Sheet ───────────────────────────────────────────────────────────────────
export {
  Sheet,
  SheetClose,
  SheetTrigger,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from './sheet/index.js'

// ── Skeleton ─────────────────────────────────────────────────────────────────
export { Skeleton } from './skeleton/index.js'

// ── Table ───────────────────────────────────────────────────────────────────
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './table/index.js'

// ── Tabs ────────────────────────────────────────────────────────────────────
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  tabsListVariants,
  type TabsListVariant,
} from './tabs/index.js'

// ── Textarea ─────────────────────────────────────────────────────────────────
export { Textarea } from './textarea/index.js'
