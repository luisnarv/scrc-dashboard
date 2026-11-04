import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El Dockerfile fija NEXT_OUTPUT=standalone para generar una imagen mínima;
  // en Vercel la variable no existe y el despliegue sigue igual que antes.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/data/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
