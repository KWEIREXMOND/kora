import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the sandbox's live-preview hosts so Next.js dev doesn't block/hold
  // pages when they are opened through the preview proxy. The sandbox host
  // changes each session, so wildcard the domains.
  allowedDevOrigins: [
    "*.e2b.app",
    "*.arena.site",
  ],
  // Production security headers. Deliberately no X-Frame-Options/CSP: the
  // storefront must stay embeddable (previews, payment popups) and a CSP
  // allowlist would risk breaking checkout/popup flows.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Ignored over plain HTTP; enforced once Hostinger serves HTTPS.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
