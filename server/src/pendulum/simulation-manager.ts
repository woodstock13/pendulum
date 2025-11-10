/**
 * Simulation management for pendulum instance
 */
import { PendulumSimulation } from '../simulation/pendulum-simulation';
import type { PendulumConfig, SimulationState } from '../simulation/pendulum-simulation';
import { FPS } from './config';

// Simulation state
let simulation: PendulumSimulation | null = null;
let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Utility to clear interval and stop simulation
 * Reusable in MQTT handlers and API endpoints
 */
function stopSimulation(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isRunning = false;
}

/**
 * Configure a new simulation
 */
function configure(config: PendulumConfig, maxTime: number = 60): void {
  // Stop existing simulation if running
  stopSimulation();

  // Create new simulation
  simulation = new PendulumSimulation(config, maxTime);
}

/**
 * Start the simulation
 */
function start(): boolean {
  if (!simulation) {
    return false;
  }

  if (isRunning) {
    return true; // Already running
  }

  isRunning = true;
  intervalId = setInterval(() => {
    if (simulation && isRunning && !simulation.isFinished()) {
      simulation.step();
    }
  }, 1000 / FPS);

  return true;
}

/**
 * Stop the simulation
 */
function stop(): void {
  stopSimulation();
}

/**
 * Reset the simulation
 */
function reset(): boolean {
  if (!simulation) {
    return false;
  }

  simulation.reset();
  return true;
}

/**
 * Get current simulation state
 */
function getState(): SimulationState | null {
  if (!simulation) {
    return null;
  }

  return simulation.getState();
}

/**
 * Get simulation config
 */
function getConfig(): PendulumConfig | null {
  if (!simulation) {
    return null;
  }

  return simulation.getConfig();
}

/**
 * Check if simulation is finished
 */
function isFinished(): boolean {
  if (!simulation) {
    return false;
  }

  return simulation.isFinished();
}

// Export singleton instance
export const simulationManager = {
  configure,
  start,
  stop,
  reset,
  getState,
  getConfig,
  isFinished,
  get isRunning() {
    return isRunning;
  },
  get isConfigured() {
    return simulation !== null;
  },
};
