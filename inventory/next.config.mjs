/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are stable in 14.2 but kept explicit for clarity
  },
};

export default nextConfig;
