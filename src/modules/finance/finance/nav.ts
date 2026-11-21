import {
  LayoutDashboard, ArrowLeftRight, Wallet, BookOpen, Layers, GraduationCap, Scale,
  FileBarChart, Settings, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
  report?: string | undefined;
  children?: ({ title: string; tab: string }[]) | undefined;
}

export const NAV: NavItem[] = [
  { title: "Dashboard", to: "/finance", icon: LayoutDashboard },
  { title: "Daily Transactions", to: "/finance/transactions", icon: ArrowLeftRight },
  { title: "Petty Cash", to: "/finance/petty-cash", icon: Wallet },
  { title: "Books & Ledgers", to: "/finance/ledgers", icon: BookOpen },
  { title: "Fee Collection", to: "/finance/fees", icon: GraduationCap },
  { title: "Daily Settlements", to: "/finance/settlements", icon: Scale },
  { title: "Course Fees", to: "/finance/allocation", icon: Layers },
  { title: "Financial Reports", to: "/finance/reports", icon: FileBarChart, report: "income-report" },
  { title: "Finance Settings", to: "/finance/settings", icon: Settings },
];
