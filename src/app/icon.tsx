import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#10182B",
          borderRadius: 7,
        }}
      >
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            color: "#7C6DF2",
            fontFamily: "sans-serif",
          }}
        >
          V
        </div>
      </div>
    ),
    { ...size }
  );
}
