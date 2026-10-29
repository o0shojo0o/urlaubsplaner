process.env.APP_ORIGIN = process.env.DEV_ORIGIN || 'http://localhost:5173';
await import('./server.js');
