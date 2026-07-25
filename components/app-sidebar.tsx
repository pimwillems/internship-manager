"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRange,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Upload,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/students", label: "Students", icon: GraduationCap },
  { href: "/assessors", label: "Assessors", icon: Users },
  { href: "/planning", label: "Planning", icon: CalendarRange },
  { href: "/import", label: "Import / Export", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-muted/30 hidden w-56 shrink-0 flex-col border-r p-3 md:flex">
      <div className="mb-4 px-2 pt-2">
        <span className="text-sm font-semibold">Internship Coord.</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
