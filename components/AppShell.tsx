"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";

const links = [
  { href: "/", label: "Notes" },
  { href: "/research", label: "Research" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export default function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);
  }, []);

  function cycleTheme() {
    const next: Theme =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    applyTheme(next);
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen md:flex">
      <aside
        className="hidden md:flex md:w-56 md:flex-col md:border-r md:p-4 md:sticky md:top-0 md:h-screen"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="mb-6">
          <div className="text-lg font-semibold">Z-Notes</div>
          <div className="muted small">AI notes with reliable sources</div>
        </div>

        <nav className="flex flex-col gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-link ${isActive(link.href) ? "nav-link-active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-6">
          <button className="btn w-full" onClick={cycleTheme} type="button">
            Theme: {theme}
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>

      <nav className="mobile-nav md:hidden">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={isActive(link.href) ? "nav-link-active" : ""}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
