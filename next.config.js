/** @type {import('next').NextConfig} */

// Next's app router injects inline bootstrap scripts, so script-src needs
// 'unsafe-inline' unless a per-request nonce is wired up. Everything else
// is locked to same-origin.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb", // uploads are capped at 5 MB in src/server/uploads.ts
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/onboarding/login", destination: "/login", permanent: true },
      { source: "/onboarding/register", destination: "/login", permanent: true },
      { source: "/onboarding/:path*", destination: "/login", permanent: true },
      { source: "/profile/deleted", destination: "/account-deleted", permanent: true },
      { source: "/moderation/events", destination: "/moderation", permanent: false },
    ];
  },
};

module.exports = nextConfig;
