import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Comprobantes de pago y, en la solicitud de crédito, dos fotos de cédula (cada una máx. 1.5 MB tras comprimirla en el navegador).
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      {
        // Service worker de la app instalable: nunca en caché, para que las actualizaciones lleguen enseguida.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
