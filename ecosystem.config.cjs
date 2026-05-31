module.exports = {
  apps: [{
    name: 'showcase-backend',
    script: './backend/dist/index.js',
    cwd: '/var/www/walkable/app',
    instances: 1,              // 1GB server — single worker saves ~70MB RAM
    exec_mode: 'fork',         // fork is more memory-efficient than cluster for 1 instance
    autorestart: true,
    watch: false,
    max_memory_restart: '300M', // restart if process exceeds 300MB
    restart_delay: 5000,        // wait 5s before restart (prevents rapid crash loops)
    exp_backoff_restart_delay: 100, // exponential backoff up to 15s
    node_args: '--max-old-space-size=256', // hard cap Node.js heap at 256MB
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/root/.pm2/logs/showcase-backend-error.log',
    out_file: '/root/.pm2/logs/showcase-backend-out.log',
    merge_logs: true,
    env: { NODE_ENV: 'production' },
  }],
};
