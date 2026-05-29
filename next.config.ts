import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // read-excel-file/node usa unzipper, che ha un require opzionale di
  // @aws-sdk/client-s3 mai chiamato a runtime. Marcandolo external evita
  // che Turbopack provi a bundlare i path mai usati.
  serverExternalPackages: ["read-excel-file", "unzipper"],
  experimental: {
    serverActions: {
      // Default Next.js: 1 MB. Alzato per consentire upload bulk fatture
      // (ZIP con XML FatturaPA o PDF multipli) e allegati singoli fino a 20 MB.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
