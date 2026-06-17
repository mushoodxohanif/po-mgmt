import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

const BRAND_COLOR = "#1da1f2";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: BRAND_COLOR,
        borderRadius: 8,
        color: "#ffffff",
        fontSize: 14,
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
