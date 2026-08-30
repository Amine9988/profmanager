import type { NextConfig } from "next";
import os from "os";

function devOrigins(): string[] {
  const origins = ["localhost", "127.0.0.1"];
  try {
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const net of nets || []) {
        if (net.family === "IPv4" && !net.internal) origins.push(net.address);
      }
    }
  } catch {}
  return origins;
}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["sql.js", "nodemailer"],
  allowedDevOrigins: devOrigins(),
  turbopack: { root: __dirname },
};

export default nextConfig;
