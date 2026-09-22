"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, initials } from "@/lib/client";
import { Icon } from "./Icon";

const NAV = [
  { href: "/", label: "Dashboard", icon: "dashboard", adminOnly: false },
  { href: "/donantes", label: "Donantes", icon: "group", adminOnly: false },
  { href: "/recordatorios", label: "Recordatorios", icon: "notifications_active", adminOnly: false },
  { href: "/citas", label: "Citas", icon: "event", adminOnly: false },
  { href: "/mensajeria", label: "Mensajería", icon: "mail", adminOnly: false },
  { href: "/usuarios", label: "Usuarios", icon: "manage_accounts", adminOnly: true },
  { href: "/configuracion", label: "Configuración", icon: "settings", adminOnly: true },
];

const TITLES: Record<string, string> = {
  "/": "Resumen del día",
  "/donantes": "Gestión de donantes",
  "/recordatorios": "Donantes elegibles",
  "/citas": "Citas agendadas",
  "/mensajeria": "Plantillas de mensajería",
  "/usuarios": "Control de usuarios",
  "/configuracion": "Configuración del sistema",
};

const SIDEBAR_KEY = "huav-sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "operador">("operador");
  const [userName, setUserName] = useState("Usuario");

  useEffect(() => {
    void api<{ role: "admin" | "operador"; name: string }>("/api/auth/me")
      .then((me) => {
        setUserRole(me.role === "admin" ? "admin" : "operador");
        setUserName(me.name || "Usuario");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const adminOnly = pathname.startsWith("/configuracion") || pathname.startsWith("/usuarios");
    if (adminOnly && userRole !== "admin") {
      router.replace("/");
    }
  }, [pathname, router, userRole]);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const sidebarWidth = collapsed ? "w-[72px]" : "w-[280px]";
  const mainOffset = collapsed ? "md:ml-[72px]" : "md:ml-[280px]";

  return (
    <div className="min-h-screen bg-background text-on-surface">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-[#111c2d]/40 md:hidden"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`bg-surface-container-lowest ${sidebarWidth} h-screen fixed left-0 top-0 border-r border-outline-variant flex flex-col py-md z-50 transition-all duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className={`px-md mb-lg flex items-center ${collapsed ? "justify-center" : "gap-sm"}`}>
          <img src="/logo.png" alt="HUAV" className={`${collapsed ? "h-8" : "h-10"} w-auto rounded`} />
          {!collapsed ? (
            <div>
              <h1 className="text-headline-md font-black text-primary leading-none">HUAV</h1>
              <p className="text-label-md text-secondary uppercase mt-1">Banco de sangre</p>
            </div>
          ) : null}
        </div>

        <nav className="flex flex-col gap-1 px-sm flex-1">
          {NAV.filter((item) => !item.adminOnly || userRole === "admin").map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-4"} py-3 rounded-lg transition-colors ${
                  active
                    ? "text-primary font-bold border-r-4 border-primary bg-primary-fixed"
                    : "text-secondary hover:text-primary hover:bg-surface-container"
                }`}
              >
                <Icon name={item.icon} filled={active} />
                {!collapsed ? <span className="text-title-md">{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="px-md flex flex-col gap-sm">
          {!collapsed ? (
            <Link
              href="/donantes?nuevo=1"
              onClick={() => setMobileOpen(false)}
              className="w-full py-3 px-md bg-primary-container text-on-primary text-title-md rounded-lg hover:opacity-90 text-center"
            >
              Registrar donante
            </Link>
          ) : null}
          <button
            type="button"
            onClick={logout}
            title="Cerrar sesión"
            className={`flex items-center ${collapsed ? "justify-center" : "gap-3 px-2"} py-2 rounded-lg text-secondary hover:text-primary hover:bg-surface-container`}
          >
            <Icon name="logout" />
            {!collapsed ? <span className="text-title-md">Cerrar sesión</span> : null}
          </button>
        </div>
      </aside>

      <div className={`${mainOffset} min-h-screen flex flex-col transition-all duration-200`}>
        <header className="sticky top-0 z-40 h-16 bg-surface-container-lowest border-b border-outline-variant flex items-center justify-between px-margin-mobile md:px-lg">
          <div className="flex items-center gap-sm flex-1">
            <button
              type="button"
              className="md:hidden p-2 text-secondary"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Icon name="menu" />
            </button>
            <button
              type="button"
              className="hidden md:inline-flex p-2 text-secondary hover:text-primary rounded-lg hover:bg-surface-container"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expandir menú" : "Ocultar menú"}
            >
              <Icon name={collapsed ? "chevron_right" : "chevron_left"} />
            </button>
            <h2 className="text-title-lg text-on-surface hidden sm:block">
              {TITLES[pathname] ?? "HUAV"}
            </h2>
          </div>
          <form
            className="relative hidden md:block"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/donantes?q=${encodeURIComponent(query)}`);
            }}
          >
            <Icon
              name="search"
              className="absolute left-sm top-1/2 -translate-y-1/2 text-secondary text-[20px]"
            />
            <input
              className="pl-10 pr-4 py-2 bg-surface-container rounded-full border border-transparent focus:border-primary focus:ring-1 focus:ring-primary text-body-sm w-64 outline-none"
              placeholder="Buscar donantes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <div className="ml-sm flex items-center gap-1">
            <span
              className="w-8 h-8 rounded-full bg-primary-fixed text-primary flex items-center justify-center text-label-md"
              title={userName}
            >
              {initials(userName) || "US"}
            </span>
          </div>
        </header>
        <main className="flex-1 p-margin-mobile md:p-margin-desktop max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
