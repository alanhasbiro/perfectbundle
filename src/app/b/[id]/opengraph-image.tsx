import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const alt = "A gift bundle, shared via PerfectBundle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function getTheme(id: string): Promise<string | null> {
  try {
    const bundle = await fetchQuery(api.bundles.getPublic, { id: id as Id<"bundles"> });
    return bundle?.theme ?? null;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const theme = await getTheme(id);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          padding: "80px",
        }}
      >
        <div style={{ fontSize: 120, display: "flex" }}>🎁</div>
        <div
          style={{
            marginTop: 24,
            fontSize: 64,
            fontWeight: 700,
            color: "#171717",
            textAlign: "center",
            display: "flex",
          }}
        >
          {theme ?? "A gift bundle, shared with you"}
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 30,
            color: "#525252",
            display: "flex",
          }}
        >
          on PerfectBundle
        </div>
      </div>
    ),
    { ...size }
  );
}
