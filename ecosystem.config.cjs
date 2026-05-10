module.exports = {
  apps: [
    {
      name: 'matschema',
      cwd: '/opt/project_1_matschema',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        SESSION_SECRET: process.env.SESSION_SECRET,
        COOKIE_SECURE: 'false'
      }
    }
  ]
};
