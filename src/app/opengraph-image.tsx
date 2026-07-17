import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Generated OG image (docs/08 launch polish) — no static asset to maintain. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
          color: "white",
          fontSize: 64,
          fontWeight: 700,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: "#60a5fa" }}>ParaOU</span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 400, marginTop: 24, color: "#cbd5e1" }}>
          Inteligencia de contrataciones públicas de Paraguay
        </div>
      </div>
    ),
    { ...size },
  );
}
