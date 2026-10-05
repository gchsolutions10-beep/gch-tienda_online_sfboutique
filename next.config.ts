import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Captura del comprobante de transferencia (máx. 1.5 MB tras comprimirla en el navegador).
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
