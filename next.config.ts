import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Source PDFs are capped at 8 MB (see src/lib/quizzes/pdf.ts) — this
      // must stay above that plus multipart/form-data overhead.
      bodySizeLimit: "9mb",
    },
  },
};

export default nextConfig;
