import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { dict } from "@/lib/i18n";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthNav } from "@/components/AuthNav";
import { FollowMigrator } from "@/components/FollowMigrator";

export const metadata: Metadata = {
  title: { default: "ParaOU — Licitaciones de Paraguay", template: "%s · ParaOU" },
  description: "Buscá y filtrá todas las licitaciones públicas de Paraguay (DNCP). Fuente: DNCP.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
};

// Set the theme before paint to avoid a flash (reads localStorage / OS preference).
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = dict();
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <span className="text-primary">◆</span> {t.brand}
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/licitaciones" className="hover:text-primary">
                {t.nav.tenders}
              </Link>
              <Link href="/panel" className="hover:text-primary">
                Mi panel
              </Link>
              <Link href="/perfil" className="hover:text-primary">
                Mi perfil
              </Link>
              <AuthNav />
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <FollowMigrator />
        {children}
        <footer className="mt-16 border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">
            {t.overview.source} · {t.tagline}
          </div>
        </footer>
      </body>
    </html>
  );
}
