import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

const BRAND_COLOR = "#1da1f2";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: BRAND_COLOR,
        borderRadius: 40,
        color: "#ffffff",
        fontSize: 72,
        fontWeight: 700,
      }}
    >
      PO
    </div>,
    {
      ...size,
    },
  );
}
