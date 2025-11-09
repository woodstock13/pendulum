/**
 * API Client for Pendulum Server
 * Handles all HTTP communication with the pendulum backend
 */

export class PendulumApiClient {
  constructor(baseUrl = "http://localhost:3000") {
    this.baseUrl = baseUrl;
    this.isConnected = false;
  }

  /**
   * Configure the pendulum with initial parameters
   * @param {number} id - Pendulum ID (0-4)
   * @param {Object} config - Configuration object
   * @param {number} config.pivotX - Pivot X position in cm
   * @param {number} config.angle - Initial angle in radians
   * @param {number} config.angularVelocity - Initial angular velocity (default: 0)
   * @param {number} config.mass - Mass in kg
   * @param {number} config.length - String length in cm
   * @param {number} config.radius - Bob radius in cm
   * @param {number} config.gravity - Gravity constant (default: 9.81)
   * @returns {Promise<Object>} Response from server
   */
  async configure(id, config) {
    console.log(
      ` Configuring pendulum ${id} with config: ${JSON.stringify(config)}`
    );

    try {
      const response = await fetch(`${this.baseUrl}/configure/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.isConnected = true;
      return data;
    } catch (error) {
      this.isConnected = false;
      console.error("Failed to configure pendulum:", error);
      throw error;
    }
  }

  /**
   * Get the current state of the pendulum
   * @returns {Promise<Object>} Current state with angle, velocity, etc.
   */
  async getState() {
    try {
      const response = await fetch(`${this.baseUrl}/state`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.isConnected = true;
      return data;
    } catch (error) {
      this.isConnected = false;
      console.error("Failed to get pendulum state:", error);
      throw error;
    }
  }

  /**
   * Send a control command to the pendulum simulation
   * @param {string} action - Control action: 'start', 'pause', or 'stop'
   * @returns {Promise<Object>} Response from server
   */
  async control(action) {
    try {
      const response = await fetch(`${this.baseUrl}/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.isConnected = true;
      return data;
    } catch (error) {
      this.isConnected = false;
      console.error("Failed to send control command:", error);
      throw error;
    }
  }

  /**
   * Start polling the server for state updates
   * @param {Function} callback - Function to call with state updates
   * @param {number} interval - Polling interval in ms (default: 100ms = 10 FPS)
   * @returns {number} Interval ID for stopping the polling
   */
  startPolling(callback, interval = 100) {
    return setInterval(async () => {
      try {
        const state = await this.getState();

        callback(state);
      } catch (error) {
        // Error already logged in getState
      }
    }, interval);
  }

  /**
   * Stop polling the server
   * @param {number} intervalId - The interval ID returned by startPolling
   */
  stopPolling(intervalId) {
    clearInterval(intervalId);
  }

  /**
   * Check server health/connectivity
   * @returns {Promise<Object>} Health status from server
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.isConnected = true;
      return data;
    } catch (error) {
      this.isConnected = false;
      console.error("Failed to check server health:", error);
      throw error;
    }
  }

  /**
   * Reset system - kill all instance processes
   * @returns {Promise<Object>} Response from server with killedIds
   */
  async reset() {
    try {
      const response = await fetch(`${this.baseUrl}/reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.isConnected = true;
      return data;
    } catch (error) {
      this.isConnected = false;
      console.error("Failed to reset system:", error);
      throw error;
    }
  }
}
