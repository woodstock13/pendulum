/**
 * MQTT handler for pendulum instance
 */
import mqtt from 'mqtt';
import { simulationManager } from './simulation-manager';
import { BROKER_URL, CLIENT_ID, TOPIC, INSTANCE_ID } from './config';

// MQTT client
const mqttClient = mqtt.connect(BROKER_URL, { clientId: CLIENT_ID });

/**
 * Initialize MQTT connection and handlers
 */
function initialize(): void {
  // Connection handler
  mqttClient.on('connect', () => {
    console.log(`🔗 Connected to MQTT broker as ${CLIENT_ID}`);

    mqttClient.subscribe(TOPIC, (err) => {
      if (err) {
        console.error(`Failed to subscribe to topic ${TOPIC}:`, err);
      }
    });
  });

  // Message handler
  mqttClient.on('message', (topic, message) => {
    // Stop simulation on collision message
    if (topic === 'pendulum/collision/stop') {
      if (simulationManager.isRunning) {
        simulationManager.stop();
        console.log(`🛑 Instance ${INSTANCE_ID} stopped via MQTT collision signal`);
      }

      // Publish acknowledgment
      mqttClient.publish(
        'pendulum/ack/stopped',
        JSON.stringify({ instanceId: INSTANCE_ID }),
        { qos: 1 }
      );
    }

    // Restart simulation on restart message
    if (topic === 'pendulum/collision/restart') {
      if (simulationManager.isConfigured && !simulationManager.isRunning) {
        simulationManager.start();
        console.log(`✅ Instance ${INSTANCE_ID} simulation restarted`);
      }

      // Publish acknowledgment
      mqttClient.publish(
        'pendulum/ack/restarted',
        JSON.stringify({ instanceId: INSTANCE_ID }),
        { qos: 0 }
      );
    }
  });
}

// Export singleton instance
export const mqttHandler = {
  initialize,
};
