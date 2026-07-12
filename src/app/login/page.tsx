import type { Metadata } from "next";
import { dict } from "@/lib/i18n";
import { googleAuthConfigured } from "@/lib/env";
import { Card } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  const t = dict().auth;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">{t.loginTitle}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.loginSubtitle}</p>
      <Card className="mt-6 p-6">
        <LoginForm googleEnabled={googleAuthConfigured()} />
      </Card>
    </main>
  );
}
