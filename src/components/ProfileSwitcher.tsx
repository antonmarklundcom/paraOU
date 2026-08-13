"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import {
  getActiveProfileId,
  profileFetch,
  setActiveProfileId,
} from "@/lib/profileStore";

interface ProfileSummary {
  id: string;
  name: string;
}

/**
 * Multi-profile switcher (Phase F2): create, name, switch between, and delete
 * additional company profiles. Signed-in only — anonymous visitors have a
 * single anonToken-backed profile with nothing to switch between. Every
 * switch/create/delete forces a full reload so every consumer (the /perfil
 * wizard, /panel's match feed, saved searches, follows) re-reads the newly
 * active `x-profile-id` from scratch instead of juggling ad-hoc refresh state.
 */
export function ProfileSwitcher() {
  const { status } = useSession();
  const t = dict().profileSwitcher;
  const [profiles, setProfiles] = useState<ProfileSummary[] | null>(null);
  const [maxProfiles, setMaxProfiles] = useState<number | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    void profileFetch("/api/profile/list").then(async (res) => {
      if (!res.ok) return;
      const { data } = await res.json();
      setProfiles(data.profiles);
      setMaxProfiles(data.maxProfiles);
      const stored = getActiveProfileId();
      const resolved =
        stored && data.profiles.some((p: ProfileSummary) => p.id === stored)
          ? stored
          : (data.profiles[0]?.id ?? null);
      setActiveIdState(resolved);
      if (resolved) setActiveProfileId(resolved);
    });
  }, [status]);

  if (status !== "authenticated" || !profiles || profiles.length === 0) return null;

  function switchTo(id: string) {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    setActiveProfileId(id);
    const path = window.location.pathname;
    window.location.href = path === "/panel" ? "/panel" : "/perfil";
  }

  const atLimit = maxProfiles != null && profiles!.length >= maxProfiles;

  function addNew() {
    setOpen(false);
    window.location.href = "/perfil?new=1";
  }

  async function remove(p: ProfileSummary) {
    if (!window.confirm(t.deleteConfirm)) return;
    const res = await profileFetch(`/api/profile/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      window.alert(body?.error?.message ?? t.deleteLastError);
      return;
    }
    if (p.id === activeId) {
      const fallback = (profiles ?? []).find((x) => x.id !== p.id);
      if (fallback) setActiveProfileId(fallback.id);
    }
    window.location.reload();
  }

  const active = profiles.find((p) => p.id === activeId) ?? profiles[0];

  return (
    <div className="relative mb-4 inline-block text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 hover:bg-accent"
      >
        <span className="text-muted-foreground">{t.label}:</span>
        <span className="font-semibold">{active?.name}</span>
        <span className="text-xs text-muted-foreground">
          ({maxProfiles == null
            ? `${profiles.length} ${t.unlimited}`
            : `${profiles.length} ${t.of} ${maxProfiles}`}
          )
        </span>
        <span aria-hidden>▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-border bg-popover p-1 shadow-md">
          {profiles.map((p) => (
            <div
              key={p.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-accent",
                p.id === activeId && "bg-accent",
              )}
            >
              <button
                type="button"
                onClick={() => switchTo(p.id)}
                className="flex-1 truncate text-left"
              >
                {p.id === activeId ? "✓ " : ""}
                {p.name}
              </button>
              {profiles.length > 1 && (
                <button
                  type="button"
                  onClick={() => void remove(p)}
                  title={t.deleteProfile}
                  className="text-muted-foreground hover:text-status-closed"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="mt-1 border-t border-border pt-1">
            {atLimit ? (
              <a
                href="/precios"
                className="block rounded px-2 py-1.5 text-muted-foreground hover:bg-accent"
              >
                {t.addLocked}
              </a>
            ) : (
              <button
                type="button"
                onClick={addNew}
                className="block w-full rounded px-2 py-1.5 text-left font-medium text-primary hover:bg-accent"
              >
                {t.newProfile}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
