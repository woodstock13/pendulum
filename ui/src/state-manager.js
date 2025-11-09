/**
 * State Manager - Bridges async API polling with synchronous p5.js rendering
 * Decouples network I/O from the render loop for smooth 60 FPS performance
 */

export class StateManager {
  constructor(apiClient, pollInterval = 100, mockMode = false) {
    this.apiClient = apiClient;
    this.pollInterval = pollInterval;
    this.mockMode = mockMode;

    // Cached state (read synchronously by renderer)
    this.currentState = null;

    // Polling control
    this.isPolling = false;
    this.pollIntervalId = null;

    // Mock physics state
    this.mockTime = 0;
    this.mockAngle = 0.5;
    this.mockVelocity = 0;
    this.mockLength = 200;
    this.mockMass = 1.0;
    this.mockStatus = 'STOPPED';

    // Metrics
    this.lastPollTime = 0;
    this.pollCount = 0;
    this.errorCount = 0;
    this.lastUpdateTimestamp = 0;

    // Callbacks
    this.onUpdate = null;  // Called when new data arrives
    this.onError = null;   // Called on fetch errors
  }

  /**
   * Start polling API server or running mock simulation
   */
  startPolling() {
    if (this.isPolling) return;

    this.isPolling = true;
    console.log(`🔄 Started polling (${this.pollInterval}ms interval, mock: ${this.mockMode})`);

    // Immediate first update
    this.poll();

    // Setup interval
    this.pollIntervalId = setInterval(() => {
      this.poll();
    }, this.pollInterval);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (!this.isPolling) return;

    this.isPolling = false;
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    console.log('⏸️ Stopped polling');
  }

  /**
   * Single poll cycle (async in background)
   */
  async poll() {
    const startTime = performance.now();

    try {
      let state;

      if (this.mockMode) {
        // Generate mock physics data
        state = this.generateMockState();
      } else {
        // Fetch from real API
        state = await this.apiClient.getState();
      }

      // Update cached state
      this.updateState(state);

      // Metrics
      this.lastPollTime = performance.now() - startTime;
      this.pollCount++;

      // Notify listeners
      if (this.onUpdate) {
        this.onUpdate(this.currentState);
      }

    } catch (error) {
      this.errorCount++;
      console.error('❌ Poll error:', error.message);

      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Generate mock physics state for testing without backend
   */
  generateMockState() {
    // Simple pendulum physics simulation
    const g = 9.81; // gravity
    const dt = this.pollInterval / 1000; // delta time in seconds

    if (this.mockStatus === 'RUNNING') {
      // Physics update: θ'' = -(g/L) * sin(θ)
      const angularAcceleration = -(g / (this.mockLength / 100)) * Math.sin(this.mockAngle);

      this.mockVelocity += angularAcceleration * dt;
      this.mockAngle += this.mockVelocity * dt;

      // Apply damping
      this.mockVelocity *= 0.995;

      this.mockTime += dt;
    }

    return {
      angle: this.mockAngle,
      angularVelocity: this.mockVelocity,
      length: this.mockLength,
      mass: this.mockMass,
      status: this.mockStatus,
      timestamp: Date.now(),
    };
  }

  /**
   * Update internal state cache
   */
  updateState(newState) {
    if (newState !== null) {
      this.currentState = {
        ...newState,
        timestamp: Date.now(),
      };
      this.lastUpdateTimestamp = Date.now();
    }
  }

  /**
   * Get current state (synchronous - safe for draw())
   * @returns {Object|null} Current pendulum state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Check if data is stale
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {boolean} True if data is older than maxAge
   */
  isStale(maxAge = 1000) {
    if (!this.currentState) return true;

    const age = Date.now() - this.currentState.timestamp;
    return age > maxAge;
  }

  /**
   * Get polling metrics
   * @returns {Object} Metrics object
   */
  getMetrics() {
    return {
      pollCount: this.pollCount,
      errorCount: this.errorCount,
      lastPollTime: this.lastPollTime,
      errorRate: this.errorCount / Math.max(this.pollCount, 1),
      isStale: this.isStale(),
      dataAge: this.currentState ? Date.now() - this.currentState.timestamp : -1,
    };
  }

  /**
   * Force immediate poll
   */
  async forcePoll() {
    await this.poll();
  }

  /**
   * Update mock configuration (for testing)
   */
  setMockConfig(config) {
    if (config.angle !== undefined) this.mockAngle = config.angle;
    if (config.mass !== undefined) this.mockMass = config.mass;
    if (config.length !== undefined) this.mockLength = config.length;
    if (config.angularVelocity !== undefined) this.mockVelocity = config.angularVelocity;
  }

  /**
   * Control mock simulation
   */
  setMockStatus(status) {
    this.mockStatus = status;
    console.log(`🎮 Mock status: ${status}`);
  }

  /**
   * Toggle between mock and real mode
   */
  setMockMode(enabled) {
    this.mockMode = enabled;
    console.log(`${enabled ? '🎭' : '🌐'} Mock mode: ${enabled}`);
  }

  /**
   * Reset mock state
   */
  resetMock() {
    this.mockAngle = 0.5;
    this.mockVelocity = 0;
    this.mockTime = 0;
    this.mockStatus = 'STOPPED';
    console.log('🔄 Mock state reset');
  }
}
