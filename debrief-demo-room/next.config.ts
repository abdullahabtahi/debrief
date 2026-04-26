import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep heavy GCP packages as Node.js externals — never bundle them.
  // Prevents Turbopack from parsing ~200 MB of Google Cloud SDK source.
  serverExternalPackages: [
    '@google-cloud/storage',
    '@google-cloud/tasks',
    '@google-cloud/vertexai',
    'google-auth-library',
  ],
};

export default nextConfig;
