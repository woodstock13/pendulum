/**
 * API endpoints for master server
 */
import { Router, Request, Response } from 'express';
import { processManager } from './process-manager';
import { mqttCoordinator } from './mqtt';
import { PORT, MAX_INSTANCES } from './config';

const router = Router();

/**
 * GET /health - Health check
 */
router.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    role: 'master',
    port: PORT,
    instances: processManager.processes.size,
    maxInstances: MAX_INSTANCES,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /state - Aggregate state from all instances
 * Returns shared state (time, isFinished, isRunning) and per-pendulum data
 */
router.get('/state', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pendulums = [];

    for (const [id, pendulum] of processManager.processes) {
      // Only include configured instances
      if (!pendulum.configured) {
        continue;
      }

      try {
        const state = await processManager.forward(id, '/state', 'GET');
        // Keep per-pendulum data (including position for collision detection)
        pendulums.push({
          id: state.id,
          pivotX: state.pivotX,
          angle: state.angle,
          angularVelocity: state.angularVelocity,
          length: state.length,
          position: state.position, // Pre-calculated 2D position from instance
        });
      } catch (error) {
        console.error(`Failed to get state from instance ${id}:`, error);
      }
    }

    // Get shared state from first pendulum (all should have same time/isRunning/isFinished)
    let time = 0;
    let isFinished = false;
    let isRunning = false;

    if (pendulums.length > 0) {
      const firstInstance = await processManager.forward(pendulums[0].id, '/state', 'GET');
      time = firstInstance.time;
      isFinished = firstInstance.isFinished;
      isRunning = firstInstance.isRunning;
    }

    // Detect collisions if simulation is running
    const collisionDetected =
      isRunning && pendulums.length > 1 ? await mqttCoordinator.detectCollisions(pendulums) : false;

    res.json({
      pendulums,
      time,
      isFinished,
      isRunning,
      collisionDetected,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get state',
    });
  }
});

/**
 * POST /configure/:id - Configure specific instance
 */
router.post('/configure/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id < 0 || id >= MAX_INSTANCES) {
    res.status(400).json({ error: `Invalid instance ID. Must be 0-${MAX_INSTANCES - 1}` });
    return;
  }

  try {
    // Check if instance exists (should already be spawned at startup)
    const pendulum = processManager.getProcess(id);
    if (!pendulum) {
      res.status(500).json({
        error: `Instance ${id} not found. Server may not be fully initialized.`,
      });
      return;
    }

    // Forward configuration
    const result = await processManager.forward(id, '/configure', 'POST', req.body);

    // Mark as configured
    pendulum.configured = true;

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to configure instance',
    });
  }
});

/**
 * POST /control - Control all configured instances
 */
router.post('/control', async (req: Request, res: Response): Promise<void> => {
  const { action } = req.body;

  if (!action) {
    res.status(400).json({ error: 'Missing action parameter' });
    return;
  }

  const validActions = ['start', 'stop'];
  if (!validActions.includes(action)) {
    res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
    return;
  }

  try {
    const results = [];

    // Only control configured instances
    for (const [id, pendulum] of processManager.processes) {
      if (!pendulum.configured) {
        continue;
      }

      try {
        const result = await processManager.forward(id, `/${action}`, 'POST');
        results.push({ id, success: true, ...result });

        if (action === 'start') pendulum.isRunning = true;
        if (action === 'stop') pendulum.isRunning = false;
      } catch (error) {
        console.error(`Failed to ${action} instance ${id}:`, error);
        results.push({ id, success: false, error: 'Failed' });
      }
    }

    if (results.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No configured instances to control',
      });
      return;
    }

    res.json({
      success: true,
      action,
      results,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Control action failed',
    });
  }
});

/**
 * POST /reset - Stop all running simulations
 */
router.post('/reset', async (_req: Request, res: Response): Promise<void> => {
  const stoppedIds = [];
  const errors = [];

  // Stop all configured instances
  for (const [id, pendulum] of processManager.processes) {
    if (!pendulum.configured) {
      continue;
    }

    try {
      await processManager.forward(id, '/stop', 'POST');
      pendulum.isRunning = false; // Update state
      pendulum.configured = false; // Clear configured flag
      stoppedIds.push(id);
      console.log(`✓ Instance ${id} simulation stopped`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push({ id, error: errorMsg });
      console.error(`✗ Failed to stop instance ${id}: ${errorMsg}`);
    }
  }

  if (stoppedIds.length > 0) {
    res.json({
      success: true,
      message: `Stopped ${stoppedIds.length} simulation(s)`,
      stoppedIds,
      errors: errors.length > 0 ? errors : undefined,
    });
  } else {
    res.json({
      success: true,
      message: 'No configured instances to stop',
    });
  }
});

/**
 * GET /instances - List all running instances
 */
router.get('/instances', (_req: Request, res: Response): void => {
  const instances = Array.from(processManager.processes.values()).map((p) => ({
    id: p.id,
    port: p.port,
    configured: p.configured,
    isRunning: p.isRunning,
    pid: p.process.pid,
  }));

  res.json({
    instances,
    count: instances.length,
  });
});

export default router;
