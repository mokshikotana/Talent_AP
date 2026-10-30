import type { NextConfig } from "next";

const securityHeaders = [
  // NOTE: no X-Frame-Options / restrictive frame-ancestors — the platform renders
  // the app inside an https preview iframe, so framing must be allowed from https.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    // Pragmatic CSP: first-party only; styles/scripts inline is required by
    // Next's hydration. Outbound fetches limited to Google's Gemini endpoint.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://generativelanguage.googleapis.com",
      "frame-ancestors https:", // allow embedding only from secure (https) hosts, e.g. the preview iframe
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
