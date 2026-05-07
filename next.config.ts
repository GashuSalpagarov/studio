import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
// Имя репо на GitHub — basePath нужен для project pages (gashusalpagarov.github.io/studio).
const repoName = "studio";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Статический экспорт — для GitHub Pages.
  output: "export",
  // GitHub Pages не любит динамические маршруты без trailing slash.
  trailingSlash: true,
  // Без серверной оптимизации картинок (на GH Pages нет Node-сервера).
  images: { unoptimized: true },
  // В dev — без префикса, чтобы работало на localhost. В prod — /studio.
  basePath: isProd ? `/${repoName}` : "",
  assetPrefix: isProd ? `/${repoName}/` : "",
  // NOTE: reactCompiler требует babel-plugin-react-compiler в node_modules.
  // Включим на следующих шагах вместе с установкой плагина.
  // reactCompiler: true,
};

export default nextConfig;
