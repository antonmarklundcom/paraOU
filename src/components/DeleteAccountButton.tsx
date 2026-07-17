"use client";

import { useRouter } from "next/navigation";

export function DeleteAccountButton() {
  const router = useRouter();

  async function onClick() {
    if (
      !window.confirm("¿Eliminar tu cuenta de forma permanente? Esta acción no se puede deshacer.")
    )
      return;
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) router.push("/");
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className="rounded-md border border-status-closing px-4 py-2 text-sm text-status-closing hover:bg-status-closing/10"
    >
      Eliminar mi cuenta
    </button>
  );
}
