const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

function buildCsp() {
  const supabaseOrigin = (() => {
    try {
      return supabaseUrl ? new URL(supabaseUrl).origin : "";
    } catch {
      return "";
    }
  })();

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "script-src 'self' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://squore.double-yellow.be",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.google.com https://www.gstatic.com https://*.supabase.co https://squore.double-yellow.be http://squore.double-yellow.be" +
      (supabaseOrigin ? ` ${supabaseOrigin}` : ""),
    "font-src 'self' data:",
    "connect-src 'self' https://www.google.com https://www.gstatic.com https://*.supabase.co" +
      (supabaseOrigin ? ` ${supabaseOrigin}` : ""),
    "frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com",
    "upgrade-insecure-requests"
  ].join("; ");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co"
      },
      {
        protocol: "https",
        hostname: "squore.double-yellow.be"
      },
      {
        protocol: "http",
        hostname: "squore.double-yellow.be"
      }
    ]
  },
  async headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: buildCsp()
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin"
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff"
      },
      {
        key: "X-Frame-Options",
        value: "DENY"
      },
      {
        key: "Permissions-Policy",
        value: "geolocation=(self), microphone=(), camera=()"
      }
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders
      },
      {
        source: "/api/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate"
          },
          {
            key: "Pragma",
            value: "no-cache"
          },
          {
            key: "Expires",
            value: "0"
          },
          {
            key: "Vary",
            value: "Authorization, Cookie"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
