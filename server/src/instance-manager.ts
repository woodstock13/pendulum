import { PendulumSimulation } from './simulation/pendulum-simulation';
import type { PendulumConfig } from './simulation/pendulum-simulation';

/**
 * Represents a single pendulum instance with its own simulation loop
 */
export interface PendulumInstance {
  id: number;
  simulation: PendulumSimulation;
  config: PendulumConfig;
  isRunning: boolean;
  intervalId: NodeJS.Timeout | null;
  createdAt: number;
}

/**
 * Manages multiple pendulum instances with isolated simulation loops
 */
export class InstanceManager {
  private instances: Map<number, PendulumInstance> = new Map();
  private readonly maxInstances: number = 5;
  private readonly fps: number = 60;

  /**
   * Create or update a pendulum instance
   */
  createInstance(id: number, config: PendulumConfig, maxTime: number = 60): PendulumInstance {
    // Validate instance ID
    if (id < 0 || id >= this.maxInstances) {
      throw new Error(`Instance ID must be between 0 and ${this.maxInstances - 1}`);
    }

    // Stop and remove existing instance if it exists
    if (this.instances.has(id)) {
      this.deleteInstance(id);
    }

    // Create new simulation
    const simulation = new PendulumSimulation(config, maxTime);

    // Create instance
    const instance: PendulumInstance = {
      id,
      simulation,
      config,
      isRunning: false,
      intervalId: null,
      createdAt: Date.now(),
    };

    this.instances.set(id, instance);
    return instance;
  }

  /**
   * Get an instance by ID
   */
  getInstance(id: number): PendulumInstance | undefined {
    return this.instances.get(id);
  }

  /**
   * Delete an instance and clean up its simulation loop
   */
  deleteInstance(id: number): boolean {
    const instance = this.instances.get(id);
    if (!instance) {
      return false;
    }

    // Stop simulation loop
    this.stopInstance(id);

    // Remove from map
    this.instances.delete(id);
    return true;
  }

  /**
   * Start an instance's simulation loop
   */
  startInstance(id: number): boolean {
    const instance = this.instances.get(id);
    if (!instance) {
      return false;
    }

    // Already running
    if (instance.isRunning && instance.intervalId) {
      return true;
    }

    // Start simulation loop
    instance.isRunning = true;
    instance.intervalId = setInterval(() => {
      if (instance.isRunning && !instance.simulation.isFinished()) {
        instance.simulation.step();
      }
    }, 1000 / this.fps);

    return true;
  }

  /**
   * Stop an instance's simulation loop
   */
  stopInstance(id: number): boolean {
    const instance = this.instances.get(id);
    if (!instance) {
      return false;
    }

    instance.isRunning = false;

    if (instance.intervalId) {
      clearInterval(instance.intervalId);
      instance.intervalId = null;
    }

    return true;
  }

  /**
   * Reset an instance to its initial state
   */
  resetInstance(id: number, newConfig?: PendulumConfig): boolean {
    const instance = this.instances.get(id);
    if (!instance) {
      return false;
    }

    instance.simulation.reset(newConfig);

    if (newConfig) {
      instance.config = newConfig;
    }

    return true;
  }

  /**
   * Start all instances
   */
  startAll(): void {
    this.instances.forEach((_, id) => this.startInstance(id));
  }

  /**
   * Stop all instances
   */
  stopAll(): void {
    this.instances.forEach((_, id) => this.stopInstance(id));
  }

  /**
   * Reset all instances
   */
  resetAll(): void {
    this.instances.forEach((_, id) => this.resetInstance(id));
  }

  /**
   * Get all instances as an array
   */
  listInstances(): PendulumInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get number of active instances
   */
  count(): number {
    return this.instances.size;
  }

  /**
   * Clear all instances and clean up
   */
  clear(): void {
    this.instances.forEach((_, id) => this.deleteInstance(id));
  }

  /**
   * Check if any instance is running
   */
  isAnyRunning(): boolean {
    return Array.from(this.instances.values()).some(inst => inst.isRunning);
  }
}
