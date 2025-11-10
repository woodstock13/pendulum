/**
 * Single Pendulum Instance Server
 * Runs one pendulum simulation on a dedicated port
 */
import express, { Request, Response } from 'express';
import { simulationManager } from './pendulum/simulation-manager';
import { mqttHandler } from './pendulum/mqtt';
import endpointsRouter from './pendulum/endpoints';
import { PORT, INSTANCE_ID } from './pendulum/config';

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

// Mount API endpoints
app.use(endpointsRouter);

// ============================================
// SERVER STARTUP
// ============================================

const server = app.listen(PORT, () => {
  console.log(`🎯 Pendulum Instance #${INSTANCE_ID} running on port ${PORT}`);

  // Initialize MQTT connection
  mqttHandler.initialize();
});

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`Failed to start instance #${INSTANCE_ID}:`, error.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`\n🛑 Instance #${INSTANCE_ID} shutting down...`);
  simulationManager.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`\n🛑 Instance #${INSTANCE_ID} shutting down...`);
  simulationManager.stop();
  process.exit(0);
});
