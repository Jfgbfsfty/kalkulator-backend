// PM2 config dla samego backendu
// Uruchomienie: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'kalkulator-backend',
      script: 'src/server.js',
      interpreter: 'node',
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
    },
  ],
};
