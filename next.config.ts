import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // NOTE: reactCompiler требует babel-plugin-react-compiler в node_modules.
  // Включим на следующих шагах вместе с установкой плагина.
  // reactCompiler: true,
};

export default nextConfig;
