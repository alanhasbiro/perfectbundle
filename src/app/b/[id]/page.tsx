import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BundleCard } from "@/components/bundles/bundle-card";
import { ShareViewTracker } from "./share-view-tracker";

async function getBundle(id: string) {
  try {
    return await fetchQuery(api.bundles.getPublic, { id: id as Id<"bundles"> });
  } catch {
    // malformed id or backend error — treat identically to "not found"
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const bundle = await getBundle(id);
  if (!bundle) {
    return { title: "Gift bundle — PerfectBundle" };
  }
  return {
    title: `${bundle.theme} — PerfectBundle`,
    description: bundle.rationale,
    openGraph: { title: bundle.theme, description: bundle.rationale },
    twitter: { card: "summary_large_image", title: bundle.theme, description: bundle.rationale },
  };
}

export default async function SharedBundlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getBundle(id);

  if (!bundle) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="opacity-70">This bundle isn&apos;t available.</p>
        <Link href="/quiz" className="rounded-full bg-foreground px-6 py-2.5 text-background">
          Build your own
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <ShareViewTracker bundleId={id} />
      <h1 className="text-3xl font-semibold">A gift bundle, shared with you 🎁</h1>
      <BundleCard content={bundle} country={bundle.quiz.country} urgency={bundle.quiz.urgency} />
      <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
        Build your own bundle →
      </Link>
    </main>
  );
}
