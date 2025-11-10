/**
 * MQTT coordination and collision detection for master server
 */
import mqtt from 'mqtt';
import { PendulumData } from './types';
import { BROKER_URL, CLIENT_ID, EXPECTED_INSTANCES, PORT } from './config';

// MQTT client
const mqttClient = mqtt.connect(BROKER_URL, { clientId: CLIENT_ID });

// ACK tracking state
let publishedACKCount: Set<number> = new Set();
let restartedACKCount: Set<number> = new Set();

// Collision state
let stopOnCollision = true;
let isCollisionInProgress = false;

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

      // Use pre-calculated positions from instances
      const pos1 = p1.position;
      const pos2 = p2.position;

      // Calculate distance between bobs
      const dx = pos1.x - pos2.x;
      const dy = pos1.y - pos2.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Check collision
      const hasCollision = distance < MIN_COLLISION_DISTANCE;
      if (hasCollision) {
        collisionDetected = true;

        if (stopOnCollision && !isCollisionInProgress) {
          isCollisionInProgress = true;
          publishCollisionDetected([p1, p2]);
          break;
        }
      }
    }
  }

  return collisionDetected;
}

/**
 * Publish collision STOP message to all instances
 */
function publishCollisionDetected(pendulums: PendulumData[]): void {
  const message = {
    pendulums,
  };

  mqttClient.publish('pendulum/collision/stop', JSON.stringify(message), { qos: 1 }, (error) => {
    if (error) {
      console.error('Failed to publish STOP message:', error);
    }
  });
}

/**
 * Publish RESTART message to all instances
 */
function publishCollisionRestart(): void {
  mqttClient.publish('pendulum/collision/restart', JSON.stringify({}), { qos: 1 });
}

/**
 * Resume simulation by calling /control endpoint
 */
async function resumeSimulation(): Promise<void> {
  try {
    const response = await fetch(`http://localhost:${PORT}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });

    await response.json();

    // Reset collision state after successful restart
    isCollisionInProgress = false;
  } catch (error) {
    console.error('Failed to resume simulation:', error);
    // Reset collision state on error to allow retry
    isCollisionInProgress = false;
  }
}

/**
 * Initialize MQTT connection and handlers
 */
function initialize(): void {
  // Connection handler
  mqttClient.on('connect', () => {
    console.log(`🔗 Connected to MQTT broker as ${CLIENT_ID}`);
    publishedACKCount.clear();
    restartedACKCount.clear();

    mqttClient.subscribe('pendulum/ack/#', (err) => {
      if (err) {
        console.error(`Failed to subscribe to topic pendulum/ack/#:`, err);
      }
    });
  });

  // Message handler
  mqttClient.on('message', (topic, message) => {
    const data = JSON.parse(message.toString());
    const { instanceId } = data;

    if (topic === 'pendulum/ack/stopped') {
      publishedACKCount.add(instanceId);

      if (publishedACKCount.size === EXPECTED_INSTANCES) {
        console.log('All instances acknowledged STOP message');

        // wait for 5 seconds before publishing RESTART message
        setTimeout(() => {
          publishCollisionRestart();
        }, 5000);

        publishedACKCount.clear();
      }
    }

    if (topic === 'pendulum/ack/restarted') {
      restartedACKCount.add(instanceId);
      if (restartedACKCount.size === EXPECTED_INSTANCES) {
        console.log('All instances acknowledged RESTART message');
        restartedACKCount.clear();

        // resume the simulation by itself call
        resumeSimulation();
      }
    }
  });
}

// Export singleton instance
export const mqttCoordinator = {
  initialize,
  detectCollisions,
  get isCollisionInProgress() {
    return isCollisionInProgress;
  },
};
