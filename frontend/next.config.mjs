/** @type {import('next').NextConfig} */
const backendDev = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  },
  async rewrites() {
    // Single-tunnel friend test: frontend :3000 proxies API + WS + health
    // to backend :8000, so one ngrok URL covers both (free tier = 1 domain).
    return [
      { source: "/health", destination: `${backendDev}/health` },
      { source: "/api/:path*", destination: `${backendDev}/api/:path*` },
      { source: "/ws/:path*", destination: `${backendDev}/ws/:path*` },
    ];
  },
};

export default nextConfig;
