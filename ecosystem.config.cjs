module.exports = {
  apps: [{
    name: 'showcase-backend',
    script: './backend/dist/index.js',
    cwd: '/var/www/walkable/app',
    instances: 2,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    env: { NODE_ENV: 'production' },
  }],
};
