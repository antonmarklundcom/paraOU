import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { dict } from "@/lib/i18n";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthProvider } from "@/components/AuthProvider";
import { AuthHeader } from "@/components/AuthHeader";
import { ClaimProfileOnLogin } from "@/components/ClaimProfileOnLogin";

const description = "Buscá y filtrá todas las licitaciones públicas de Paraguay (DNCP). Fuente: DNCP.";

export const metadata: Metadata = {
  title: { default: "ParaOU — Licitaciones de Paraguay", template: "%s · ParaOU" },
  description,
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "ParaOU — Licitaciones de Paraguay",
    description,
    locale: "es_PY",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "ParaOU — Licitaciones de Paraguay", description },
};

const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

// Set the theme before paint to avoid a flash (reads localStorage / OS preference).
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = dict();
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {plausibleDomain && (
          <script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
          />
        )}
      </head>
      <body className="min-h-screen">
        <AuthProvider>
          <ClaimProfileOnLogin />
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
                  {t.nav.panel}
                </Link>
                <Link href="/precios" className="hover:text-primary">
                  {t.nav.pricing}
                </Link>
                <ThemeToggle />
                <AuthHeader />
              </nav>
            </div>
          </header>
          {children}
          <footer className="mt-16 border-t border-border">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
              <span>
                {t.overview.source} · {t.tagline}
              </span>
              <span className="flex gap-4">
                <Link href="/terminos" className="hover:text-primary hover:underline">
                  {t.footer.terms}
                </Link>
                <Link href="/privacidad" className="hover:text-primary hover:underline">
                  {t.footer.privacy}
                </Link>
              </span>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
