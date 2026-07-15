import { auth } from "@/lib/auth";
import { ApiError, handle, ok } from "@/lib/api/http";
import { accountPrefsSchema, deleteAccount, updateAccountPrefs } from "@/lib/api/account";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  return session.user.id;
}

export const GET = handle(async (req) => {
  enforcePublicRateLimit(req);
  const session = await auth();
  if (!session?.user) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  return ok({
    email: session.user.email,
    locale: session.user.locale,
    alertChannel: session.user.alertChannel,
    alertFrequency: session.user.alertFrequency,
    plan: session.user.plan,
  });
});

export const PATCH = handle(async (req) => {
  enforcePublicRateLimit(req);
  const userId = await requireUserId();
  const prefs = accountPrefsSchema.parse(await req.json());
  await updateAccountPrefs(userId, prefs);
  return ok({ saved: true });
});

export const DELETE = handle(async (req) => {
  enforcePublicRateLimit(req);
  const userId = await requireUserId();
  await deleteAccount(userId);
  return ok({ deleted: true });
});
