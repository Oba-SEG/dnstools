module.exports = {
  apps: [
    {
      name: "ndns-api",
      cwd: "./backend",
      script: "src/index.js",
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        PORT: 4001,
        ALLOWED_ORIGINS: "https://dns.segbytes.co.za",
      },
    },
    {
      name: "ndns-web",
      cwd: "./frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
    },
  ],
};
