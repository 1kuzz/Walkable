module.exports = {
  apps: [{
    name: 'showcase-backend',
    script: './backend/dist/index.js',
    cwd: '/var/www/walkable/app',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: { NODE_ENV: 'production' },
  }],
};
