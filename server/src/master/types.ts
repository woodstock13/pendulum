/**
 * Type definitions for master server
 */
import { ChildProcess } from 'child_process';

export interface PendulumProcess {
  id: number;
  port: number;
  process: ChildProcess;
  configured: boolean;
  isRunning: boolean;
}

export interface Position {
  x: number;
  y: number;
}

export interface PendulumData {
  id: number;
  pivotX: number;
  angle: number;
  angularVelocity: number;
  length?: number;
  position: Position;
}
