import NextAuth, { type DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import Google from "next-auth/providers/google";
import { prisma } from "./db.js";
import { env, emailConfigured, googleAuthConfigured } from "./env.js";
import { sendEmail } from "./email.js";

// Augment the session user with the ParaOU-specific fields the account page and
// requireProfile() need — Auth.js's default session.user only has id/name/email/image.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      locale: string;
      plan: string;
      alertChannel: string;
      alertFrequency: string;
    } & DefaultSession["user"];
  }
}
declare module "@auth/core/adapters" {
  interface AdapterUser {
    locale: string;
    plan: string;
    alertChannel: string;
    alertFrequency: string;
  }
}

/**
 * Auth.js v5 (docs: PHASE-5 #1): email magic link is the primary sign-in method,
 * Google OAuth is optional (only registered when creds are configured — CLAUDE.md
 * rule 2). AUTH_SECRET is required at runtime by Auth.js itself; we don't
 * duplicate that check here so the app still builds without it.
 *
 * The magic-link email goes through our own transport (src/lib/email.ts) so dev
 * mode logs it instead of requiring Resend — Auth.js's `sendVerificationRequest`
 * hook makes this a one-line override.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  trustHost: true,
  providers: [
    Resend({
      apiKey: env.RESEND_API_KEY || "dev-transport-unused-key",
      from: env.RESEND_FROM_EMAIL,
      async sendVerificationRequest({ identifier: to, url }) {
        await sendEmail({
          to,
          subject: "Tu enlace de acceso a ParaOU",
          html: `<p>Hacé clic para ingresar a ParaOU:</p><p><a href="${url}">${url}</a></p><p>Si no pediste este enlace, ignorá este correo.</p>`,
        });
      },
    }),
    ...(googleAuthConfigured()
      ? [Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    // Database sessions only carry the adapter's User row by default; project
    // the fields the app actually reads (account page, requireProfile()) onto
    // session.user so callers don't need a second DB round-trip.
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.locale = user.locale;
      session.user.plan = user.plan;
      session.user.alertChannel = user.alertChannel;
      session.user.alertFrequency = user.alertFrequency;
      return session;
    },
  },
});

export function authConfigured(): boolean {
  return Boolean(env.AUTH_SECRET);
}

export { emailConfigured };
