/**
 * Configuration constants for pendulum server
 */

// Get port and instance ID from command line args or environment
export const PORT = parseInt(process.env.PORT || process.argv[2] || '3001', 10);
export const INSTANCE_ID = parseInt(process.env.INSTANCE_ID || process.argv[3] || '0', 10);

// MQTT configuration
export const BROKER_URL = 'mqtt://localhost:1883';
export const TOPIC = 'pendulum/collision/#';
export const CLIENT_ID = `pendulum-${INSTANCE_ID}`;

// Simulation constants
export const FPS = 60;
