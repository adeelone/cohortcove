import { ImageResponse } from "next/og";

export const alt = "CohortCove — the trustworthy campus events board";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#FAF6F0", padding: 72, fontFamily: "Georgia, serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#AE4A1D" }} />
          <span style={{ fontSize: 40, fontWeight: 700, color: "#2B2620" }}>CohortCove</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 72, fontWeight: 700, color: "#2B2620", lineHeight: 1.05 }}>Every campus event,</span>
          <span style={{ fontSize: 72, fontWeight: 700, color: "#AE4A1D", lineHeight: 1.05, fontStyle: "italic" }}>verified and in one calm place.</span>
        </div>
        <span style={{ fontSize: 28, color: "#645B51" }}>RSVPs · waitlists · approvals · moderation — built for student life</span>
      </div>
    ),
    size,
  );
}
