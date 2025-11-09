/**
 * Simple Pendulum Physics with 2D Position
 */

export interface PendulumConfig {
  pivotX: number; // X position of pivot (cm)
  angle: number; // θ (radians)
  angularVelocity: number; // ω (rad/s)
  mass: number; // m (kg)
  length: number; // L (cm)
  gravity: number; // g (m/s²)
}

export interface Position2D {
  x: number; // cm
  y: number; // cm
}

export interface SimulationState {
  angle: number; // θ (radians)
  angularVelocity: number; // ω (rad/s)
  time: number; // t (seconds)
  position: Position2D; // Bob position in 2D
}

export class PendulumSimulation {
  private config: PendulumConfig;
  private state: SimulationState;
  private dt: number = 0.016; // 60 FPS
  private maxTime: number;
  private readonly COLLISION_RADIUS: number = 2; // Hardcoded collision radius (cm)

  constructor(config: PendulumConfig, maxTime: number = 60) {
    this.config = config;
    this.maxTime = maxTime;
    this.state = {
      angle: config.angle,
      angularVelocity: config.angularVelocity,
      time: 0,
      position: this.calculatePosition(config.angle),
    };
  }

  /**
   * Calculate bob position in 2D space
   */
  private calculatePosition(angle: number): Position2D {
    const { pivotX, length } = this.config;
    return {
      x: pivotX + length * Math.sin(angle),
      y: length * (1 - Math.cos(angle)),
    };
  }

  /**
   * Physics update
   */
  public step(): SimulationState {
    if (this.state.time >= this.maxTime) {
      return this.state;
    }

    const { gravity, length } = this.config;
    const dt = this.dt;

    // Convert gravity from m/s² to cm/s²
    const g_cm = gravity * 100;

    // Calculate acceleration
    const acceleration = -(g_cm / length) * Math.sin(this.state.angle);

    // Update velocity and angle
    this.state.angularVelocity += acceleration * dt;
    this.state.angle += this.state.angularVelocity * dt;

    // Update 2D position
    this.state.position = this.calculatePosition(this.state.angle);

    // Update time
    this.state.time += dt;

    return this.state;
  }

  public getState(): SimulationState {
    return { ...this.state, position: { ...this.state.position } };
  }

  public getConfig(): PendulumConfig {
    return { ...this.config };
  }

  public isFinished(): boolean {
    return this.state.time >= this.maxTime;
  }

  public reset(config?: PendulumConfig): void {
    if (config) {
      this.config = config;
    }
    this.state = {
      angle: this.config.angle,
      angularVelocity: this.config.angularVelocity,
      time: 0,
      position: this.calculatePosition(this.config.angle),
    };
  }

  public getProgress(): number {
    return Math.min(1, this.state.time / this.maxTime);
  }

  /**
   * Check collision with another pendulum
   */
  public checkCollisionWith(other: PendulumSimulation): boolean {
    const posA = this.state.position;
    const posB = other.state.position;

    const dx = posA.x - posB.x;
    const dy = posA.y - posB.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const minDistance = this.COLLISION_RADIUS + other.COLLISION_RADIUS;

    return distance < minDistance;
  }

  /**
   * Get distance to another pendulum
   */
  public getDistanceTo(other: PendulumSimulation): number {
    const posA = this.state.position;
    const posB = other.state.position;

    const dx = posA.x - posB.x;
    const dy = posA.y - posB.y;

    return Math.sqrt(dx * dx + dy * dy);
  }
}
