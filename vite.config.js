import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function gameClientAssetsPlugin() {
  const assetsRoot = path.resolve(__dirname, "src/game-client/assets");

  return {
    name: "game-client-assets",

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/assets/")) return next();

        const relPath = decodeURIComponent(req.url.slice("/assets/".length));
        const filePath = path.join(assetsRoot, relPath);

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          return next();
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = {
          ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
          ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
          ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".opus": "audio/opus",
          ".wav": "audio/wav", ".mp4": "video/mp4",
          ".json": "application/json", ".js": "application/javascript",
          ".xml": "application/xml", ".fnt": "text/plain",
          ".glsl": "text/plain", ".frag": "text/plain", ".vert": "text/plain",
        };

        res.setHeader("Content-Type", mime[ext] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(filePath).pipe(res);
      });
    },

    async writeBundle(options) {
      const outDir = options.dir || path.resolve(__dirname, "dist");
      const dest = path.join(outDir, "assets");
      copyDirSync(assetsRoot, dest);
    },
  };
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export default defineConfig({
  plugins: [react(), gameClientAssetsPlugin()],

  server: {
    port: 3000,
    open: true,
    host: true,
  },

  build: {
    outDir: "dist",
  },
});
