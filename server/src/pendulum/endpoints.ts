/**
 * API endpoints for pendulum instance
 */
import { Router, Request, Response } from 'express';
import { simulationManager } from './simulation-manager';
import type { PendulumConfig } from '../simulation/pendulum-simulation';
import { PORT, INSTANCE_ID } from './config';

const router = Router();

/**
 * GET /health - Health check
 */
router.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    instanceId: INSTANCE_ID,
    port: PORT,
    configured: simulationManager.isConfigured,
    isRunning: simulationManager.isRunning,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /state - Get current pendulum state
 * Returns: id, pivotX, angle, angularVelocity, time, isFinished, isRunning
 */
router.get('/state', (_req: Request, res: Response): void => {
  if (!simulationManager.isConfigured) {
    res.status(404).json({ error: 'Pendulum not configured' });
    return;
  }

  const state = simulationManager.getState();
  const config = simulationManager.getConfig();

  if (!state || !config) {
    res.status(500).json({ error: 'Failed to get state' });
    return;
  }

  res.json({
    id: INSTANCE_ID,
    pivotX: config.pivotX,
    angle: state.angle,
    angularVelocity: state.angularVelocity,
    length: config.length,
    position: state.position, // 2D position {x, y} for collision detection
    time: state.time,
    isFinished: simulationManager.isFinished(),
    isRunning: simulationManager.isRunning,
  });
});

/**
 * POST /configure - Configure this pendulum instance
 * Required: pivotX, angle, mass, length, gravity
 */
router.post('/configure', (req: Request, res: Response): void => {
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

  // Create new simulation (angularVelocity defaults to 0, radius is hardcoded in simulation)
  const config: PendulumConfig = {
    pivotX,
    angle,
    angularVelocity: 0, // Always start at rest
    mass,
    length,
    gravity,
  };

  simulationManager.configure(config, maxTime);

  res.json({
    success: true,
    instanceId: INSTANCE_ID,
  });
});

/**
 * POST /start - Start simulation
 */
router.post('/start', (_req: Request, res: Response): void => {
  if (!simulationManager.isConfigured) {
    res.status(404).json({ error: 'Pendulum not configured' });
    return;
  }

  if (simulationManager.isRunning) {
    res.json({ success: true, message: 'Already running' });
    return;
  }

  simulationManager.start();

  res.json({ success: true, message: 'Simulation started' });
});

/**
 * POST /stop - Stop simulation
 */
router.post('/stop', (_req: Request, res: Response): void => {
  simulationManager.stop();

  res.json({ success: true, message: 'Simulation stopped' });
});

/**
 * POST /reset - Reset simulation
 */
router.post('/reset', (_req: Request, res: Response): void => {
  if (!simulationManager.isConfigured) {
    res.status(404).json({ error: 'Pendulum not configured' });
    return;
  }

  simulationManager.reset();
  res.json({ success: true, message: 'Simulation reset' });
});

export default router;
