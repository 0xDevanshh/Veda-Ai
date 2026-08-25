"use client";

import {
  ArrowLeft,
  Bell,
  Bookmark,
  Calendar,
  ChevronDown,
  ChevronsLeft,
  ClipboardList,
  FileText,
  Home,
  Library,
  Menu,
  Settings,
  Sparkles,
  HelpCircle,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";

type NavItem = {
  label: string;
  icon: typeof Home;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: Home, href: "/" },
  { label: "My Classroom", icon: Calendar, href: "/classroom" },
  { label: "Assignments", icon: ClipboardList, href: "/assignments" },
  { label: "Exams", icon: FileText, href: "/exams" },
  { label: "My Library", icon: Library, href: "/library" },
];

const ACTIVE_ROUTE = "Exams";

interface AppShellProps {
  children: ReactNode;
  breadcrumb: string;
  collapsed?: boolean;
}

export default function AppShell({
  children,
  breadcrumb,
  collapsed = false,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  // Close the drawer once the viewport crosses back into desktop territory.
  useEffect(() => {
    if (!navOpen) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [navOpen]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!navOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f5f5f5]">
      {/* Desktop sidebar — hidden below md regardless of `collapsed` */}
      <aside
        className={clsx(
          "hidden h-full shrink-0 flex-col border-r border-gray-200 bg-white transition-all duration-200 md:flex",
          collapsed ? "w-[60px] items-center px-2 py-4" : "w-[270px] px-4 py-4"
        )}
      >
        <SidebarBody collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar breadcrumb={breadcrumb} onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 overflow-auto bg-[#f5f5f5]">{children}</main>
      </div>

      <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} />
    </div>
  );
}

/**
 * Shared sidebar contents. Rendered inside the fixed desktop column and,
 * unchanged, inside the mobile drawer.
 */
function SidebarBody({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* Logo row */}
      <div
        className={clsx(
          "flex items-center",
          collapsed ? "flex-col gap-3" : "justify-between"
        )}
      >
        <div className={clsx("flex items-center gap-2", collapsed && "flex-col gap-1")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black">
            <span className="text-sm font-bold text-white">V</span>
          </div>
          {!collapsed && (
            <span className="text-base font-semibold text-gray-900">VedaAI</span>
          )}
        </div>
        {!collapsed && (
          <button
            type="button"
            aria-label={onNavigate ? "Close menu" : "Collapse sidebar"}
            onClick={onNavigate}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
          >
            {onNavigate ? <X size={16} /> : <ChevronsLeft size={16} />}
          </button>
        )}
      </div>

      {/* AI Teacher's Toolkit pill */}
      {collapsed ? (
        <button
          type="button"
          aria-label="AI Teacher's Toolkit"
          className="mt-4 flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-orange-400 bg-black text-white"
        >
          <Sparkles size={16} />
        </button>
      ) : (
        <button
          type="button"
          className="mt-4 flex items-center justify-center gap-2 rounded-full border-[1.5px] border-orange-400 bg-black px-4 py-2.5 text-white"
        >
          <Sparkles size={16} />
          <span className="text-sm font-medium">AI Teacher&apos;s Toolkit</span>
        </button>
      )}

      {/* Nav list */}
      <nav className={clsx("mt-6 flex flex-col gap-1", collapsed && "items-center")}>
        {NAV_ITEMS.map((item) => {
          const active = item.label === ACTIVE_ROUTE;
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={clsx(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed ? "h-10 w-10 justify-center" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-gray-100 text-gray-800"
                  : "text-gray-800 hover:bg-gray-50"
              )}
            >
              <Icon size={18} className="shrink-0 text-gray-500" />
              {!collapsed && <span>{item.label}</span>}
            </a>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Settings */}
      <a
        href="/settings"
        onClick={onNavigate}
        title={collapsed ? "Settings" : undefined}
        className={clsx(
          "flex items-center rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50",
          collapsed ? "h-10 w-10 justify-center" : "gap-3 px-3 py-2.5"
        )}
      >
        <Settings size={18} className="shrink-0 text-gray-500" />
        {!collapsed && <span>Settings</span>}
      </a>

      {/* School card */}
      {collapsed ? (
        <div
          title="Delhi Public School, Bokaro Steel City"
          className="mt-2 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100"
        >
          <Bookmark size={16} className="text-gray-500" />
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2.5 rounded-lg bg-gray-100 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white">
            <Bookmark size={16} className="text-gray-500" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-gray-900">
              Delhi Public School
            </p>
            <p className="truncate text-xs text-gray-500">Bokaro Steel City</p>
          </div>
        </div>
      )}
    </>
  );
}

function MobileNavDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 md:hidden",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!open}
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        className={clsx(
          "absolute inset-0 bg-black/40 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={clsx(
          "absolute inset-y-0 right-0 flex w-[280px] max-w-[85vw] flex-col bg-white px-4 py-4 shadow-xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <SidebarBody collapsed={false} onNavigate={onClose} />
      </aside>
    </div>
  );
}

function TopBar({
  breadcrumb,
  onOpenNav,
}: {
  breadcrumb: string;
  onOpenNav: () => void;
}) {
  return (
    <header className="flex h-14 w-full shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
      {/* ---- Mobile (below md) ---- */}
      <div className="flex w-full items-center gap-2 md:hidden">
        <button
          type="button"
          aria-label="Go back"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-1.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black">
            <span className="text-xs font-bold text-white">V</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">VedaAI</span>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-50"
        >
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>
        <button
          type="button"
          aria-label="Account"
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-800 text-xs font-semibold text-white"
        >
          MR
        </button>
        <button
          type="button"
          aria-label="Open menu"
          onClick={onOpenNav}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* ---- Desktop (md and up) ---- */}
      <div className="hidden items-center gap-3 md:flex">
        <button
          type="button"
          aria-label="Go back"
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
        >
          <ArrowLeft size={18} />
        </button>
        <FileText size={16} className="text-gray-400" />
        <span className="text-sm font-medium text-gray-800">{breadcrumb}</span>
      </div>

      <div className="hidden items-center gap-3 md:flex">
        <button
          type="button"
          aria-label="Help"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          <HelpCircle size={16} />
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-50"
        >
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>
        <button
          type="button"
          aria-label="AI Assistant"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-50"
        >
          <Sparkles size={18} />
        </button>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full pl-1 pr-2 hover:bg-gray-50"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-800 text-xs font-semibold text-white">
            MR
          </div>
          <span className="text-sm font-medium text-gray-800">Madhur Rastogi</span>
          <ChevronDown size={14} className="text-gray-400" />
        </button>
      </div>
    </header>
  );
}
