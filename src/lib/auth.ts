import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db.js";
import { env, authSecret, googleConfigured } from "./env.js";
import { sendEmail } from "./email/transport.js";

/**
 * Auth.js v5 (`next-auth@5.0.0-beta.31` + `@auth/prisma-adapter@2.11.2` — current
 * versions verified on npm 2026-07-16; the adapter's required Prisma models were
 * fetched from the project's own repo, see prisma/schema.prisma). Email magic link
 * is the primary provider (PHASE-5 step 1); Google is added only when configured.
 *
 * The magic-link email is sent through our own transport (dev outbox / Resend, see
 * src/lib/email/transport.ts) via a custom `sendVerificationRequest`, rather than
 * Auth.js's built-in Resend provider, so both magic links and the alert digest
 * share one transport and one dev-outbox story.
 */

function verificationEmailHtml(url: string, host: string): string {
  return `<!doctype html><html><body style="font-family:sans-serif;padding:24px;background:#f7f7f7">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">
      <h1 style="font-size:18px">Iniciá sesión en ${host}</h1>
      <p style="color:#555">Hacé clic para confirmar tu email y entrar a ParaOU.</p>
      <p><a href="${url}" style="display:inline-block;background:#b91c3c;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Iniciar sesión</a></p>
      <p style="color:#999;font-size:12px">Si no pediste este email, podés ignorarlo.</p>
    </div>
  </body></html>`;
}

function verificationEmailText(url: string, host: string): string {
  return `Iniciá sesión en ${host}\n\n${url}\n\nSi no pediste este email, podés ignorarlo.`;
}

const providers: NextAuthConfig["providers"] = [
  {
    id: "email",
    type: "email",
    name: "Email",
    from: env.RESEND_FROM,
    maxAge: 24 * 60 * 60,
    async sendVerificationRequest({ identifier: to, url }) {
      const { host } = new URL(url);
      const result = await sendEmail({
        to,
        subject: `Iniciar sesión en ${host}`,
        html: verificationEmailHtml(url, host),
        text: verificationEmailText(url, host),
      });
      if (!result.ok) throw new Error(`Failed to send verification email: ${result.error}`);
    },
  },
];

if (googleConfigured()) {
  providers.push(
    Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: authSecret(),
  session: { strategy: "database" },
  pages: { signIn: "/entrar" },
  // Required for self-hosted deployments (docs/02: Hostinger VPS behind Caddy, not
  // Vercel) — Auth.js otherwise rejects requests whose Host header it doesn't
  // recognize. The reverse proxy is trusted to set Host correctly.
  trustHost: true,
  providers,
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
