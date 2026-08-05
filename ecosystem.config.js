// PM2 process definitions para produção, sem Docker (ver DEPLOY.md, Rota B).
// Uso: pm2 start ecosystem.config.js  |  pm2 reload ecosystem.config.js --update-env
module.exports = {
  apps: [
    {
      name: "ethos-api",
      cwd: "/opt/financial/apps/api",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "ethos-worker",
      cwd: "/opt/financial/apps/api",
      script: "dist/jobs/worker.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
