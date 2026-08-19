import { spawn } from "node:child_process";

const spawnCommand = (label, command, args, env = {}) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env }
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });

  return child;
};

const server = spawnCommand("server", "node", ["src/game-server/httpServer.js"]);
const vite = spawnCommand("vite", "vite", [], {
  VITE_GAME_SERVER_URL: process.env.VITE_GAME_SERVER_URL || "http://localhost:8787"
});

const shutdown = () => {
  server.kill();
  vite.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
