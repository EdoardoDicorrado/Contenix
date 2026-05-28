import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // read-excel-file/node usa unzipper, che ha un require opzionale di
  // @aws-sdk/client-s3 mai chiamato a runtime. Marcandolo external evita
  // che Turbopack provi a bundlare i path mai usati.
  serverExternalPackages: ["read-excel-file", "unzipper"],
};

export default nextConfig;
