/**
 * Master Server - Manages multiple pendulum instance processes
 * Runs on port 3000 and spawns child servers on ports 3001-3005
 */
import express, { Request, Response } from 'express';
import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

const app = express();
const PORT = 3000;

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
// PROCESS MANAGEMENT
// ============================================

interface PendulumProcess {
  id: number;
  port: number;
  process: ChildProcess;
  configured: boolean;
  isRunning: boolean;
}

const pendulumProcesses: Map<number, PendulumProcess> = new Map();
const BASE_PORT = 3001;
const MAX_INSTANCES = 5;
let isShuttingDown = false;

// ============================================
// Process Management
// ============================================

/**
 * Spawn a new pendulum server process
 */
function spawnPendulumServer(id: number): PendulumProcess | null {
  if (id < 0 || id >= MAX_INSTANCES) {
    return null;
  }

  const port = BASE_PORT + id;
  const serverPath = path.join(__dirname, 'pendulum-server.ts');

  // Use tsx directly (not npx tsx or node --import tsx)
  const tsxPath = path.join(__dirname, '../node_modules/.bin/tsx');
  const child = spawn(tsxPath, [serverPath, port.toString(), id.toString()], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PORT: port.toString(), INSTANCE_ID: id.toString() },
    detached: false,
  });

  // Log output
  child.stdout?.on('data', (data) => {
    console.log(`[Instance ${id}:${port}] ${data.toString().trim()}`);
  });

  child.stderr?.on('data', (data) => {
    console.error(`[Instance ${id}:${port}] !!ERROR!!: ${data.toString().trim()}`);
  });

  child.on('exit', (code) => {
    console.log(`[Instance ${id}:${port}] Process exited with code ${code}`);
    pendulumProcesses.delete(id);
  });

  const pendulumProcess: PendulumProcess = {
    id,
    port,
    process: child,
    configured: false,
    isRunning: false,
  };

  pendulumProcesses.set(id, pendulumProcess);

  return pendulumProcess;
}

/**
 * Clean up orphaned instances from previous master server runs
 * This handles cases where tsx watch killed the master without cleaning up children
 */
async function cleanupOrphanedInstances(): Promise<void> {
  console.log('Checking for orphaned instance processes...');

  for (let id = 0; id < MAX_INSTANCES; id++) {
    const port = BASE_PORT + id;
    try {
      // Find process using this port (works on macOS/Linux)
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pid = stdout.trim();

      if (pid) {
        console.log(`Found orphaned process on port ${port} (PID: ${pid}), killing...`);
        try {
          process.kill(parseInt(pid), 'SIGTERM');
          // Wait a bit for graceful shutdown
          await new Promise((resolve) => setTimeout(resolve, 100));
          // Force kill if still running
          try {
            process.kill(parseInt(pid), 'SIGKILL');
          } catch {
            // Already dead, that's fine
          }
        } catch (error) {
          console.error(`Failed to kill orphaned process ${pid}:`, error);
        }
      }
    } catch {
      // No process on this port, that's good
    }
  }

  console.log('Orphaned process cleanup complete\n');
}

/**
 * Gracefully shutdown all child processes
 */
async function shutdownGracefully(): Promise<void> {
  console.log('\n🛑 Master server shutting down gracefully...');
  isShuttingDown = true;

  const killPromises: Promise<void>[] = [];

  for (const [id, pendulum] of pendulumProcesses) {
    const killPromise = new Promise<void>((resolve) => {
      // Set up exit listener before sending signal
      pendulum.process.once('exit', () => {
        console.log(`Instance ${id} shut down`);
        resolve();
      });

      // Send SIGTERM
      pendulum.process.kill('SIGTERM');

      // Fallback: force kill after 3 seconds
      setTimeout(() => {
        try {
          pendulum.process.kill('SIGKILL');
          console.log(`Instance ${id} force killed`);
        } catch {
          // Already dead
        }
        resolve();
      }, 3000);
    });

    killPromises.push(killPromise);
  }

  // Wait for all children to exit
  await Promise.all(killPromises);
  console.log('All instances shut down');
}

/**
 * Spawn all pendulum instances on startup
 */
function spawnAllInstances(): void {
  console.log(`\nSpawning ${MAX_INSTANCES} pendulum instances...`);

  for (let id = 0; id < MAX_INSTANCES; id++) {
    const pendulum = spawnPendulumServer(id);
    if (!pendulum) {
      throw new Error(`Failed to spawn instance ${id}`);
    }
  }

  console.log(`✓ All ${MAX_INSTANCES} instances spawned\n`);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Forward request to pendulum instance
 */
async function forwardToInstance(
  id: number,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<any> {
  const pendulum = pendulumProcesses.get(id);

  if (!pendulum) {
    throw new Error(`Instance ${id} not found`);
  }

  const url = `http://localhost:${pendulum.port}${path}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  return response.json();
}

// ============================================
// Collision Detection
// ============================================

interface PendulumData {
  id: number;
  pivotX: number;
  angle: number;
  angularVelocity: number;
  length?: number;
}

interface Position {
  x: number;
  y: number;
}

/**
 * Detect collisions between pendulums
 * Returns true if any collision is detected
 */
async function detectCollisions(pendulums: PendulumData[]): Promise<boolean> {
  const COLLISION_RADIUS = 2; // cm (hardcoded in simulation)
  const MIN_COLLISION_DISTANCE = COLLISION_RADIUS * 2; // 4cm

  let collisionDetected = false;

  // Check each pair of pendulums
  for (let i = 0; i < pendulums.length; i++) {
    for (let j = i + 1; j < pendulums.length; j++) {
      const p1 = pendulums[i];
      const p2 = pendulums[j];

      // Calculate bob positions
      // Position formula: x = pivotX + length * sin(angle), y = length * (1 - cos(angle))
      const length1 = p1.length || 50; // Default to 50cm if not provided
      const length2 = p2.length || 50;

      const pos1: Position = {
        x: p1.pivotX + length1 * Math.sin(p1.angle),
        y: length1 * (1 - Math.cos(p1.angle)),
      };

      const pos2: Position = {
        x: p2.pivotX + length2 * Math.sin(p2.angle),
        y: length2 * (1 - Math.cos(p2.angle)),
      };

      // Calculate distance between bobs
      const dx = pos1.x - pos2.x;
      const dy = pos1.y - pos2.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Check collision
      if (distance < MIN_COLLISION_DISTANCE) {
        collisionDetected = true;
        console.log(
          `🔴 COLLISION DETECTED:\n` +
            `  Pendulum ${p1.id} at (${pos1.x.toFixed(2)}, ${pos1.y.toFixed(2)})\n` +
            `  Pendulum ${p2.id} at (${pos2.x.toFixed(2)}, ${pos2.y.toFixed(2)})\n` +
            `  Distance: ${distance.toFixed(2)}cm (threshold: ${MIN_COLLISION_DISTANCE}cm)`
        );

        // TODO: do mqtt publish of collision event
        // stop the simulation
        await forwardToInstance(p1.id, '/stop', 'POST');
        await forwardToInstance(p2.id, '/stop', 'POST');
      }
    }
  }

  return collisionDetected;
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * GET /health - Health check
 */
app.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    role: 'master',
    port: PORT,
    instances: pendulumProcesses.size,
    maxInstances: MAX_INSTANCES,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /state - Aggregate state from all instances
 * Returns shared state (time, isFinished, isRunning) and per-pendulum data
 */
app.get('/state', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pendulums = [];

    for (const [id, pendulum] of pendulumProcesses) {
      // Only include configured instances
      if (!pendulum.configured) {
        continue;
      }

      try {
        const state = await forwardToInstance(id, '/state', 'GET');
        // Keep per-pendulum data (need length for collision detection)
        pendulums.push({
          id: state.id,
          pivotX: state.pivotX,
          angle: state.angle,
          angularVelocity: state.angularVelocity,
          length: state.length, // Needed for collision detection
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
      const firstInstance = await forwardToInstance(pendulums[0].id, '/state', 'GET');
      time = firstInstance.time;
      isFinished = firstInstance.isFinished;
      isRunning = firstInstance.isRunning;
    }

    // Detect collisions if simulation is running
    const collisionDetected =
      isRunning && pendulums.length > 1 ? await detectCollisions(pendulums) : false;

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
app.post('/configure/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id < 0 || id >= MAX_INSTANCES) {
    res.status(400).json({ error: `Invalid instance ID. Must be 0-${MAX_INSTANCES - 1}` });
    return;
  }

  try {
    // Check if instance exists (should already be spawned at startup)
    const pendulum = pendulumProcesses.get(id);
    if (!pendulum) {
      res.status(500).json({
        error: `Instance ${id} not found. Server may not be fully initialized.`,
      });
      return;
    }

    // Forward configuration
    const result = await forwardToInstance(id, '/configure', 'POST', req.body);

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
app.post('/control', async (req: Request, res: Response): Promise<void> => {
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
    for (const [id, pendulum] of pendulumProcesses) {
      if (!pendulum.configured) {
        console.log(`Skipping instance ${id} - not configured`);
        continue;
      }

      try {
        console.log(`Forwarding to instance ${id} to ${action}`);
        const result = await forwardToInstance(id, `/${action}`, 'POST');
        console.log(`Result: ${JSON.stringify(result)}`);
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
app.post('/reset', async (_req: Request, res: Response): Promise<void> => {
  console.log('Stopping all running simulations...');

  const stoppedIds = [];
  const errors = [];

  // Stop all configured instances
  for (const [id, pendulum] of pendulumProcesses) {
    if (!pendulum.configured) {
      continue;
    }

    try {
      await forwardToInstance(id, '/stop', 'POST');
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
    console.log(`Reset complete - ${stoppedIds.length} simulation(s) stopped`);
    res.json({
      success: true,
      message: `Stopped ${stoppedIds.length} simulation(s)`,
      stoppedIds,
      errors: errors.length > 0 ? errors : undefined,
    });
  } else {
    console.log('Reset - no configured instances to stop');
    res.json({
      success: true,
      message: 'No configured instances to stop',
    });
  }
});

/**
 * GET /instances - List all running instances
 */
app.get('/instances', (_req: Request, res: Response): void => {
  const instances = Array.from(pendulumProcesses.values()).map((p) => ({
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

  // Clean up orphaned processes from previous runs
  try {
    await cleanupOrphanedInstances();
  } catch (error) {
    console.error('Failed to cleanup orphaned processes:', error);
  }

  // Spawn all instances on startup
  try {
    spawnAllInstances();
  } catch (error) {
    console.error('Failed to spawn instances:', error);
    process.exit(1);
  }
});

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  await shutdownGracefully();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await shutdownGracefully();
  process.exit(0);
});

// Backup handler for abrupt exits (e.g., tsx watch restarts)
process.on('exit', () => {
  // Can't use async here, must be synchronous
  if (!isShuttingDown) {
    console.log('\n⚠️  Abrupt exit detected, force killing instances...');
    for (const [_, pendulum] of pendulumProcesses) {
      try {
        pendulum.process.kill('SIGKILL');
      } catch {
        // Process may already be dead
      }
    }
  }
});
