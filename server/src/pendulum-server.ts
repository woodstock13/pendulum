/**
 * Single Pendulum Instance Server
 * Runs one pendulum simulation on a dedicated port
 */
import express, { Request, Response } from 'express';
import { PendulumSimulation } from './simulation/pendulum-simulation';
import type { PendulumConfig } from './simulation/pendulum-simulation';

const app = express();

// Get port and instance ID from command line args
const PORT = parseInt(process.env.PORT || process.argv[2] || '3001', 10);
const INSTANCE_ID = parseInt(process.env.INSTANCE_ID || process.argv[3] || '0', 10);

// Manual CORS headers
app.use((_req: Request, res: Response, next): void => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// SIMULATION STATE
// ============================================

let simulation: PendulumSimulation | null = null;
let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;
const fps = 60;

// ============================================
// API ENDPOINTS
// ============================================

/**
 * GET /health - Health check
 */
app.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    instanceId: INSTANCE_ID,
    port: PORT,
    configured: simulation !== null,
    isRunning,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /state - Get current pendulum state
 * Returns: id, pivotX, angle, angularVelocity, time, isFinished, isRunning
 */
app.get('/state', (_req: Request, res: Response): void => {
  if (!simulation) {
    res.status(404).json({ error: 'Pendulum not configured' });
    return;
  }

  const state = simulation.getState();
  const config = simulation.getConfig();

  res.json({
    id: INSTANCE_ID,
    pivotX: config.pivotX,
    angle: state.angle,
    angularVelocity: state.angularVelocity,
    length: config.length, // Needed for collision detection
    time: state.time,
    isFinished: simulation.isFinished(),
    isRunning,
  });
});

/**
 * POST /configure - Configure this pendulum instance
 * Required: pivotX, angle, mass, length, gravity
 */
app.post('/configure', (req: Request, res: Response): void => {
  const { pivotX, angle, mass, length, gravity, maxTime = 60 } = req.body;

  // Validate required fields
  if (
    pivotX === undefined ||
    angle === undefined ||
    mass === undefined ||
    length === undefined ||
    gravity === undefined
  ) {
    res.status(400).json({
      error: 'Missing required fields',
      required: ['pivotX', 'angle', 'mass', 'length', 'gravity'],
    });
    return;
  }

  // Stop existing simulation if running
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    isRunning = false;
  }

  // Create new simulation (angularVelocity defaults to 0, radius is hardcoded in simulation)
  const config: PendulumConfig = {
    pivotX,
    angle,
    angularVelocity: 0, // Always start at rest
    mass,
    length,
    gravity,
  };

  simulation = new PendulumSimulation(config, maxTime);

  res.json({
    success: true,
    instanceId: INSTANCE_ID,
  });
});

/**
 * POST /start - Start simulation
 */
app.post('/start', (_req: Request, res: Response): void => {
  if (!simulation) {
    res.status(404).json({ error: 'Pendulum not configured' });
    return;
  }

  if (isRunning) {
    res.json({ success: true, message: 'Already running' });
    return;
  }

  isRunning = true;
  intervalId = setInterval(() => {
    if (simulation && isRunning && !simulation.isFinished()) {
      simulation.step();
    }
  }, 1000 / fps);

  res.json({ success: true, message: 'Simulation started' });
});

/**
 * POST /stop - Stop simulation
 */
app.post('/stop', (_req: Request, res: Response): void => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isRunning = false;

  res.json({ success: true, message: 'Simulation stopped' });
});

/**
 * POST /reset - Reset simulation
 */
app.post('/reset', (_req: Request, res: Response): void => {
  if (!simulation) {
    res.status(404).json({ error: 'Pendulum not configured' });
    return;
  }

  simulation.reset();
  res.json({ success: true, message: 'Simulation reset' });
});

// ============================================
// SERVER STARTUP
// ============================================

const server = app.listen(PORT, () => {
  console.log(`🎯 Pendulum Instance #${INSTANCE_ID} running on port ${PORT}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`Failed to start instance #${INSTANCE_ID}:`, error.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`\n🛑 Instance #${INSTANCE_ID} shutting down...`);
  if (intervalId) clearInterval(intervalId);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`\n🛑 Instance #${INSTANCE_ID} shutting down...`);
  if (intervalId) clearInterval(intervalId);
  process.exit(0);
});
