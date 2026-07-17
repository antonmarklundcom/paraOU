import { handle, ok, fail } from "@/lib/api/http";
import { auth } from "@/lib/auth";
import { accountUpdateSchema, deleteAccount, updateAccount } from "@/lib/api/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = handle(async (req) => {
  const session = await auth();
  if (!session?.user?.id) return fail(401, "SIGN_IN_REQUIRED", "Not signed in");
  const body = accountUpdateSchema.safeParse(await req.json());
  if (!body.success) return fail(400, "VALIDATION", "Invalid update", body.error.flatten());
  return ok(await updateAccount(session.user.id, body.data));
});

export const DELETE = handle(async () => {
  const session = await auth();
  if (!session?.user?.id) return fail(401, "SIGN_IN_REQUIRED", "Not signed in");
  await deleteAccount(session.user.id);
  return ok({ deleted: true });
});
