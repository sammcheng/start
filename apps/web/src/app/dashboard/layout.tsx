"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import type { ReactNode } from "react";

const SIDEBAR_ITEMS = [
  { href: "/dashboard",              label: "Overview",    icon: "▣" },
  { href: "/marketplace",            label: "Marketplace", icon: "⊞" },
  { href: "/dashboard/api-keys",     label: "API Keys",    icon: "⌘" },
  { href: "/dashboard/usage",        label: "Usage",       icon: "↗" },
  { href: "/dashboard/billing",      label: "Billing",     icon: "◎" },
  { href: "/dashboard/seller",       label: "Seller",      icon: "⊕" },
  { href: "/dashboard/tools/new",    label: "List a Tool", icon: "＋" },
  { href: "/docs",                   label: "Docs",        icon: "◈" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "User"
    : "User";
  const initials = displayName[0]?.toUpperCase() ?? "U";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div className="dash-layout">
      {/* Sidebar */}
      <aside className="dash-sidebar">
        <p style={{
          fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase",
          letterSpacing: ".12em", color: "var(--faint)", marginBottom: 12, padding: "0 12px",
        }}>
          Navigation
        </p>
        {SIDEBAR_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`dash-nav-item${isActive(item.href) ? " active" : ""}`}
          >
            <span style={{ fontSize: 14, opacity: .7 }}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        {/* User info */}
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
          <div style={{ padding: "10px 12px" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "var(--blue-dim)", border: "1px solid rgba(37,99,235,.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "var(--blue)", marginBottom: 8,
              fontFamily: "var(--font-mono)",
            }}>
              {initials}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{displayName}</div>
            {email && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--faint)", marginTop: 2 }}>
                {email}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="dash-main">
        {children}
      </main>
    </div>
  );
}
