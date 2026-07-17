"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ProfileForm } from "@/components/profiles/profile-form";
import { profileToQuizState } from "@/lib/quiz/prefill";
import { detectCountry, currencyForCountry } from "@/lib/quiz/country";
import { STATE_KEY, STARTED_KEY } from "@/components/quiz/use-quiz";
import { track } from "@/lib/analytics";

export default function ProfilesPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const profiles = useQuery(api.recipientProfiles.listMine, isSignedIn ? {} : "skip");
  const create = useMutation(api.recipientProfiles.create);
  const update = useMutation(api.recipientProfiles.update);
  const remove = useMutation(api.recipientProfiles.remove);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id<"recipientProfiles"> | null>(null);

  // Declared before the early returns so hook order stays stable. It's an event
  // handler (Date.now / sessionStorage only run on click), so useCallback also
  // keeps it out of the render-phase purity check — matching use-quiz.ts submit().
  const startBundlesFor = useCallback(
    (p: { relationship: string; ageBand: string; gender?: string; interests: string[]; notes?: string }) => {
      const country = detectCountry(
        typeof navigator !== "undefined" ? navigator.language : undefined
      );
      const state = profileToQuizState(p, country, currencyForCountry(country));
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
      sessionStorage.setItem(STARTED_KEY, String(Date.now()));
      router.push("/quiz");
    },
    [router]
  );

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">Recipient profiles</h1>
        <p className="opacity-70">Sign in to save the people you buy for.</p>
        <SignInButton mode="modal">
          <button className="rounded-full bg-foreground px-6 py-2.5 text-background transition hover:opacity-85">
            Sign in
          </button>
        </SignInButton>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Recipient profiles 👤</h1>
        {!adding ? (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="rounded-full bg-foreground px-4 py-2 text-sm text-background transition hover:opacity-85"
          >
            + New profile
          </button>
        ) : null}
      </div>

      {adding ? (
        <ProfileForm
          submitLabel="Save profile"
          onSubmit={async (draft) => {
            await create(draft);
            track("profile_created", { relationship: draft.relationship });
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {profiles === undefined ? (
        <p className="opacity-60">Loading…</p>
      ) : profiles.length === 0 && !adding ? (
        <p className="opacity-70">
          No profiles yet. Save someone you buy for and skip the “who’s it for”
          questions next time.
        </p>
      ) : (
        profiles.map((p) =>
          editingId === p._id ? (
            <ProfileForm
              key={p._id}
              submitLabel="Save changes"
              initial={{
                name: p.name,
                relationship: p.relationship,
                ageBand: p.ageBand,
                gender: p.gender,
                interests: p.interests,
                notes: p.notes,
              }}
              onSubmit={async (draft) => {
                await update({ id: p._id, ...draft });
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <article
              key={p._id}
              className="flex flex-col gap-3 rounded-2xl border border-foreground/15 p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{p.name}</h2>
                  <p className="mt-1 text-sm opacity-70">
                    {p.relationship} · {p.ageBand}
                    {p.gender ? ` · ${p.gender}` : ""}
                  </p>
                </div>
              </div>
              {p.interests.length > 0 ? (
                <p className="text-sm opacity-70">{p.interests.join(", ")}</p>
              ) : null}
              {p.notes ? <p className="text-sm italic opacity-60">{p.notes}</p> : null}
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startBundlesFor(p)}
                  className="rounded-full bg-foreground px-4 py-1.5 text-xs text-background transition hover:opacity-85"
                >
                  New bundles for {p.name}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(p._id);
                    setAdding(false);
                  }}
                  className="rounded-full border border-foreground/20 px-4 py-1.5 text-xs transition hover:border-foreground/50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove({ id: p._id })}
                  className="rounded-full border border-foreground/20 px-4 py-1.5 text-xs opacity-70 transition hover:border-foreground/50 hover:opacity-100"
                >
                  Delete
                </button>
              </div>
            </article>
          )
        )
      )}
    </main>
  );
}
