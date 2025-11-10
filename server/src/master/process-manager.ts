/**
 * Process management for pendulum instances
 */
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { PendulumProcess } from './types';
import { BASE_PORT, MAX_INSTANCES } from './config';

const execAsync = promisify(exec);

// Process state
const pendulumProcesses: Map<number, PendulumProcess> = new Map();
let isShuttingDown = false;

/**
 * Spawn a new pendulum server process
 */
function spawnPendulumServer(id: number): PendulumProcess | null {
  if (id < 0 || id >= MAX_INSTANCES) {
    return null;
  }

  const port = BASE_PORT + id;
  const serverPath = path.join(__dirname, '../pendulum-server.ts');

  // Use tsx directly (not npx tsx or node --import tsx)
  const tsxPath = path.join(__dirname, '../../node_modules/.bin/tsx');
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
  for (let id = 0; id < MAX_INSTANCES; id++) {
    const port = BASE_PORT + id;
    try {
      // Find process using this port (works on macOS/Linux)
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pid = stdout.trim();

      if (pid) {
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
  for (let id = 0; id < MAX_INSTANCES; id++) {
    const pendulum = spawnPendulumServer(id);
    if (!pendulum) {
      throw new Error(`Failed to spawn instance ${id}`);
    }
  }
}

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

// Export singleton instance
export const processManager = {
  get processes() {
    return pendulumProcesses;
  },
  get isShuttingDown() {
    return isShuttingDown;
  },
  spawn: spawnPendulumServer,
  spawnAll: spawnAllInstances,
  cleanup: cleanupOrphanedInstances,
  shutdown: shutdownGracefully,
  forward: forwardToInstance,
  getProcess: (id: number) => pendulumProcesses.get(id),
};
