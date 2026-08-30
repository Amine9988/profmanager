"use client";

import { createElement, forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import {
  AlertCircle as AlertCircleRaw,
  AlertTriangle as AlertTriangleRaw,
  ArrowDownRight as ArrowDownRightRaw,
  ArrowLeft as ArrowLeftRaw,
  ArrowRight as ArrowRightRaw,
  ArrowUpRight as ArrowUpRightRaw,
  Banknote as BanknoteRaw,
  BookOpen as BookOpenRaw,
  BookOpenCheck as BookOpenCheckRaw,
  Building2 as Building2Raw,
  Cable as CableRaw,
  CalendarCheck as CalendarCheckRaw,
  CalendarClock as CalendarClockRaw,
  CalendarDays as CalendarDaysRaw,
  CalendarPlus as CalendarPlusRaw,
  CalendarX2 as CalendarX2Raw,
  Camera as CameraRaw,
  Check as CheckRaw,
  CheckCheck as CheckCheckRaw,
  CheckCircle2 as CheckCircle2Raw,
  CheckIcon as CheckIconRaw,
  ChevronDownIcon as ChevronDownIconRaw,
  ChevronLeft as ChevronLeftRaw,
  ChevronRight as ChevronRightRaw,
  ClipboardCheck as ClipboardCheckRaw,
  Clock as ClockRaw,
  Command as CommandRaw,
  CreditCard as CreditCardRaw,
  DollarSign as DollarSignRaw,
  DoorOpen as DoorOpenRaw,
  Download as DownloadRaw,
  Eye as EyeRaw,
  EyeOff as EyeOffRaw,
  FileDown as FileDownRaw,
  FileText as FileTextRaw,
  Globe as GlobeRaw,
  GraduationCap as GraduationCapRaw,
  Languages as LanguagesRaw,
  Layers as LayersRaw,
  LayoutDashboard as LayoutDashboardRaw,
  Loader2 as Loader2Raw,
  Lock as LockRaw,
  LogOut as LogOutRaw,
  MapPin as MapPinRaw,
  Maximize2 as Maximize2Raw,
  MessageSquare as MessageSquareRaw,
  Minus as MinusRaw,
  Monitor as MonitorRaw,
  Pencil as PencilRaw,
  Phone as PhoneRaw,
  PlugZap as PlugZapRaw,
  Plus as PlusRaw,
  Printer as PrinterRaw,
  RefreshCw as RefreshCwRaw,
  RotateCcw as RotateCcwRaw,
  Save as SaveRaw,
  ScanBarcode as ScanBarcodeRaw,
  School as SchoolRaw,
  ScrollText as ScrollTextRaw,
  Search as SearchRaw,
  SearchIcon as SearchIconRaw,
  SearchX as SearchXRaw,
  Settings as SettingsRaw,
  Settings2 as Settings2Raw,
  Shield as ShieldRaw,
  Smartphone as SmartphoneRaw,
  Sparkles as SparklesRaw,
  Tag as TagRaw,
  Trash2 as Trash2Raw,
  Unplug as UnplugRaw,
  Upload as UploadRaw,
  User as UserRaw,
  UserMinus as UserMinusRaw,
  UserPlus as UserPlusRaw,
  UserRound as UserRoundRaw,
  Users as UsersRaw,
  UsersRound as UsersRoundRaw,
  Wallet as WalletRaw,
  X as XRaw,
  XCircle as XCircleRaw,
  XIcon as XIconRaw,
  ZoomIn as ZoomInRaw,
  ZoomOut as ZoomOutRaw,
} from "lucide-react";

export type { LucideIcon, LucideProps };

/**
 * lucide-react adds `aria-hidden="true"` on the client only; React 19 SSR omits it,
 * which trips the hydration attribute check. Pin the attribute off on both sides.
 */
function wrap(Icon: LucideIcon): LucideIcon {
  const Wrapped = forwardRef<SVGSVGElement, Omit<LucideProps, "ref">>((props, ref) =>
    createElement(Icon, { suppressHydrationWarning: true, ...props, "aria-hidden": undefined, ref })
  );
  Wrapped.displayName = Icon.displayName;
  return Wrapped as unknown as LucideIcon;
}

export const AlertCircle = wrap(AlertCircleRaw);
export const AlertTriangle = wrap(AlertTriangleRaw);
export const ArrowDownRight = wrap(ArrowDownRightRaw);
export const ArrowLeft = wrap(ArrowLeftRaw);
export const ArrowRight = wrap(ArrowRightRaw);
export const ArrowUpRight = wrap(ArrowUpRightRaw);
export const Banknote = wrap(BanknoteRaw);
export const BookOpen = wrap(BookOpenRaw);
export const BookOpenCheck = wrap(BookOpenCheckRaw);
export const Building2 = wrap(Building2Raw);
export const Cable = wrap(CableRaw);
export const CalendarCheck = wrap(CalendarCheckRaw);
export const CalendarClock = wrap(CalendarClockRaw);
export const CalendarDays = wrap(CalendarDaysRaw);
export const CalendarPlus = wrap(CalendarPlusRaw);
export const CalendarX2 = wrap(CalendarX2Raw);
export const Camera = wrap(CameraRaw);
export const Check = wrap(CheckRaw);
export const CheckCheck = wrap(CheckCheckRaw);
export const CheckCircle2 = wrap(CheckCircle2Raw);
export const CheckIcon = wrap(CheckIconRaw);
export const ChevronDownIcon = wrap(ChevronDownIconRaw);
export const ChevronLeft = wrap(ChevronLeftRaw);
export const ChevronRight = wrap(ChevronRightRaw);
export const ClipboardCheck = wrap(ClipboardCheckRaw);
export const Clock = wrap(ClockRaw);
export const Command = wrap(CommandRaw);
export const CreditCard = wrap(CreditCardRaw);
export const DollarSign = wrap(DollarSignRaw);
export const DoorOpen = wrap(DoorOpenRaw);
export const Download = wrap(DownloadRaw);
export const Eye = wrap(EyeRaw);
export const EyeOff = wrap(EyeOffRaw);
export const FileDown = wrap(FileDownRaw);
export const FileText = wrap(FileTextRaw);
export const Globe = wrap(GlobeRaw);
export const GraduationCap = wrap(GraduationCapRaw);
export const Languages = wrap(LanguagesRaw);
export const Layers = wrap(LayersRaw);
export const LayoutDashboard = wrap(LayoutDashboardRaw);
export const Loader2 = wrap(Loader2Raw);
export const Lock = wrap(LockRaw);
export const LogOut = wrap(LogOutRaw);
export const MapPin = wrap(MapPinRaw);
export const Maximize2 = wrap(Maximize2Raw);
export const MessageSquare = wrap(MessageSquareRaw);
export const Minus = wrap(MinusRaw);
export const Monitor = wrap(MonitorRaw);
export const Pencil = wrap(PencilRaw);
export const Phone = wrap(PhoneRaw);
export const PlugZap = wrap(PlugZapRaw);
export const Plus = wrap(PlusRaw);
export const Printer = wrap(PrinterRaw);
export const RefreshCw = wrap(RefreshCwRaw);
export const RotateCcw = wrap(RotateCcwRaw);
export const Save = wrap(SaveRaw);
export const ScanBarcode = wrap(ScanBarcodeRaw);
export const School = wrap(SchoolRaw);
export const ScrollText = wrap(ScrollTextRaw);
export const Search = wrap(SearchRaw);
export const SearchIcon = wrap(SearchIconRaw);
export const SearchX = wrap(SearchXRaw);
export const Settings = wrap(SettingsRaw);
export const Settings2 = wrap(Settings2Raw);
export const Shield = wrap(ShieldRaw);
export const Smartphone = wrap(SmartphoneRaw);
export const Sparkles = wrap(SparklesRaw);
export const Tag = wrap(TagRaw);
export const Trash2 = wrap(Trash2Raw);
export const Unplug = wrap(UnplugRaw);
export const Upload = wrap(UploadRaw);
export const User = wrap(UserRaw);
export const UserMinus = wrap(UserMinusRaw);
export const UserPlus = wrap(UserPlusRaw);
export const UserRound = wrap(UserRoundRaw);
export const Users = wrap(UsersRaw);
export const UsersRound = wrap(UsersRoundRaw);
export const Wallet = wrap(WalletRaw);
export const X = wrap(XRaw);
export const XCircle = wrap(XCircleRaw);
export const XIcon = wrap(XIconRaw);
export const ZoomIn = wrap(ZoomInRaw);
export const ZoomOut = wrap(ZoomOutRaw);
