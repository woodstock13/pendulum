/**
 * Master Server - Manages multiple pendulum instance processes
 * Runs on port 3000 and spawns child servers on ports 3001-3005
 */
import express, { Request, Response } from 'express';
import { processManager } from './master/process-manager';
import { mqttCoordinator } from './master/mqtt';
import endpointsRouter from './master/endpoints';
import { PORT, BASE_PORT, MAX_INSTANCES } from './master/config';

const app = express();

// Manual CORS headers
app.use((_req: Request, res: Response, next): void => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount API routes
app.use(endpointsRouter);

// ============================================
// SERVER STARTUP
// ============================================

app.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════╗
║   🎯 Master Pendulum Server            ║
╠════════════════════════════════════════╣
║   Port: ${PORT}                        ║
║   Mode: Multi-Process Deployment       ║
║   Instance Ports: ${BASE_PORT}-${BASE_PORT + MAX_INSTANCES - 1}               ║
║   Max Instances: ${MAX_INSTANCES}                     ║
║                                        ║
║   Endpoints:                           ║
║   • GET  /health                       ║
║   • GET  /state                        ║
║   • GET  /instances (list all)         ║
║   • POST /configure/:id                ║
║   • POST /control (start / stop)       ║
║   • POST /reset (stop simulations)     ║
║                                        ║
╚════════════════════════════════════════╝
  `);

  // Initialize MQTT coordinator
  mqttCoordinator.initialize();

  // Clean up orphaned processes from previous runs
  await processManager.cleanup();

  // Spawn all instances on startup
  processManager.spawnAll();
});

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  await processManager.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await processManager.shutdown();
  process.exit(0);
});

// Backup handler for abrupt exits (e.g., tsx watch restarts)
process.on('exit', () => {
  // Can't use async here, must be synchronous
  if (!processManager.isShuttingDown) {
    console.log('\n⚠️  Abrupt exit detected, force killing instances...');
    for (const [_, pendulum] of processManager.processes) {
      try {
        pendulum.process.kill('SIGKILL');
      } catch {
        // Process may already be dead
      }
    }
  }
});
