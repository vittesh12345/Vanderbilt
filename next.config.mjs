/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Prisma out of the client bundle.
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
