import { ImageResponse } from "next/og";

export const alt = "PerfectBundle — gift bundles picked for the person";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
        }}
      >
        <div style={{ fontSize: 160, display: "flex" }}>🎁</div>
        <div
          style={{
            marginTop: 24,
            fontSize: 72,
            fontWeight: 700,
            color: "#171717",
            display: "flex",
          }}
        >
          PerfectBundle
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 34,
            color: "#525252",
            display: "flex",
          }}
        >
          Gift bundles picked for the person
        </div>
      </div>
    ),
    { ...size }
  );
}
