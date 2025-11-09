import p5 from "p5";
import { PendulumApiClient } from "./api-client.js";

// Configuration
const API_BASE_URL = "http://localhost:3000"; // Master server
const POLLING_INTERVAL = 100; // 100ms
const HEALTH_CHECK_INTERVAL = 5000; // Check every 5 seconds

// API Client
const apiClient = new PendulumApiClient(API_BASE_URL);

// Available colors for pendulums
const PENDULUM_COLORS = [
  [0, 217, 255], // cyan
  [46, 213, 115], // green
  [165, 94, 234], // purple
  [255, 165, 2], // orange
  [255, 107, 157], // pink
];

// Default pendulum configurations
const DEFAULT_CONFIGS = [
  {
    id: 0,
    pivotX: 10,
    angle: 0,
    color: PENDULUM_COLORS[0],
    mass: 1.5,
    length: 30,
    radius: 2,
    gravity: 9.81,
  },
  {
    id: 1,
    pivotX: 20,
    angle: 0,
    color: PENDULUM_COLORS[1],
    mass: 1.5,
    length: 30,
    radius: 2,
    gravity: 9.81,
  },
];

// State
let pendulumData = null;
let isPolling = false;
let pollIntervalId = null;
let isConfigMode = true; // Start in config mode
let pendulumConfigs = JSON.parse(JSON.stringify(DEFAULT_CONFIGS)); // Deep copy
let isDraggingBob = false;
let isDraggingPivot = false;
let draggedPendulumId = null;
let selectedPendulumId = 0; // Currently selected pendulum for editing

// Create p5 instance
const sketch = (p) => {
  p.setup = () => {
    p.createCanvas(1200, 800);
  };

  p.draw = () => {
    p.background(22, 33, 62);

    // Draw canvas border
    p.noFill();
    p.stroke(255);
    p.strokeWeight(2);
    p.rect(1, 1, p.width - 2, p.height - 2);

    // Choose data source based on mode
    // Show config data in config mode OR when pendulumData isn't available yet
    let pendulumsToRender = (isConfigMode || !pendulumData)
      ? pendulumConfigs
      : pendulumData?.pendulums || [];

    // In simulation mode with data, merge state with config data
    if (!isConfigMode && pendulumData) {
      pendulumsToRender = pendulumData.pendulums.map((state) => {
        const config = pendulumConfigs.find((c) => c.id === state.id) || {};
        return {
          ...config,
          ...state, // State overrides: id, pivotX, angle, angularVelocity
        };
      });
    }

    if (pendulumsToRender.length > 0) {
      const centerPivotCm = 30; // pivotX = 30cm should be at canvas center

      // Draw all pendulums
      pendulumsToRender.forEach((pendulum) => {
        const length = pendulum.length || 50;

        // Pivot position on screen (centered at pivotX = 30cm)
        const pivotX = p.width / 2 + (pendulum.pivotX - centerPivotCm) * 10;
        const pivotY = 50;

        // Calculate bob position from angle
        const bobX = pivotX + length * 10 * Math.sin(pendulum.angle);
        const bobY = pivotY + length * 10 * Math.cos(pendulum.angle);

        // Get bob color and mass
        const color = pendulum.color || [0, 217, 255];
        const mass = pendulum.mass || 1.0;
        const bobSize = 20 + (mass * 10); // Base size 20px + (mass * 10)

        // Check if mouse is hovering (only in config mode)
        const distToBob = p.dist(p.mouseX, p.mouseY, bobX, bobY);
        const distToPivot = p.dist(p.mouseX, p.mouseY, pivotX, pivotY);
        const isHoveringBob = isConfigMode && distToBob < (bobSize / 2);
        const isHoveringPivot = isConfigMode && distToPivot < 15;

        // Draw pivot point
        if (isDraggingPivot && draggedPendulumId === pendulum.id) {
          p.fill(255, 165, 2); // Orange when dragging
          p.stroke(255);
          p.strokeWeight(2);
        } else if (isHoveringPivot) {
          p.fill(255, 200, 100); // Highlighted when hovering
          p.stroke(255, 255, 255, 150);
          p.strokeWeight(2);
        } else {
          p.fill(150);
          p.noStroke();
        }
        p.circle(pivotX, pivotY, 12);

        // Draw string
        p.stroke(100);
        p.strokeWeight(2);
        p.line(pivotX, pivotY, bobX, bobY);

        // Draw bob collision radius (semi-transparent, hardcoded to 2cm)
        const COLLISION_RADIUS = 2; // Hardcoded collision radius (cm)
        const radiusPixels = COLLISION_RADIUS * 10; // Convert to pixels
        p.noFill();
        p.stroke(color[0], color[1], color[2], 100); // Semi-transparent
        p.strokeWeight(1);
        p.circle(bobX, bobY, radiusPixels * 2);

        // Draw bob with color (size based on mass)

        if (isDraggingBob && draggedPendulumId === pendulum.id) {
          p.fill(233, 69, 96); // Red when dragging
          p.stroke(255);
          p.strokeWeight(3);
        } else if (isHoveringBob) {
          p.fill(color[0], color[1], color[2]);
          p.stroke(255, 255, 255, 150);
          p.strokeWeight(2);
        } else {
          p.fill(color[0], color[1], color[2]);
          p.noStroke();
        }
        p.circle(bobX, bobY, bobSize);

        // Display pendulum ID
        p.fill(255);
        p.textSize(12);
        p.textAlign(p.CENTER);
        p.noStroke();
        p.text(`#${pendulum.id}`, bobX, bobY + 25);

        // Show angle and pivotX in config mode
        if (isConfigMode) {
          p.fill(255);
          p.textSize(11);
          p.textAlign(p.LEFT);
          p.text(
            `Angle: ${pendulum.angle.toFixed(2)}`,
            pivotX + 20,
            pivotY + 20
          );
          p.text(`PivotX: ${pendulum.pivotX}cm`, pivotX + 20, pivotY + 35);
        }
      });

      // Update control panel
      if (!isConfigMode && pendulumData) {
        document.getElementById("pendulum-count").textContent =
          pendulumData.pendulums.length;
        document.getElementById("sim-status").textContent =
          pendulumData.isRunning ? "RUNNING" : "STOPPED";
        document.getElementById("collision-status").textContent =
          pendulumData.collisionDetected ? "⚠ YES" : "None";

        const collisionEl = document.getElementById("collision-status");
        if (pendulumData.collisionDetected) {
          collisionEl.style.color = "#ff6b6b";
        } else {
          collisionEl.style.color = "#00d9ff";
        }

        // Update timeline progress bar
        const timelineProgress = document.getElementById("timeline-progress");
        if (pendulumData.isRunning) {
          timelineProgress.classList.add("visible");

          const currentTime = pendulumData.time || 0;
          const maxTime = 60;
          const percentage = Math.min(100, (currentTime / maxTime) * 100);

          document.getElementById("timeline-bar-fill").style.width = `${percentage}%`;
          document.getElementById("timeline-percentage").textContent = `${percentage.toFixed(0)}%`;
          document.getElementById("timeline-time").textContent =
            `${currentTime.toFixed(1)}s / ${maxTime.toFixed(1)}s`;
        } else {
          timelineProgress.classList.remove("visible");
        }
      } else {
        document.getElementById("pendulum-count").textContent =
          pendulumConfigs.length;
        document.getElementById("sim-status").textContent = "CONFIG MODE";
        document.getElementById("collision-status").textContent = "N/A";

        // Hide timeline in config mode
        document.getElementById("timeline-progress").classList.remove("visible");
      }
    } else {
      // No data available
      p.fill(150);
      p.textSize(16);
      p.textAlign(p.CENTER);
      p.text("No data available", p.width / 2, p.height / 2);
    }
  };

  p.mousePressed = () => {
    if (!isConfigMode) return;

    const centerPivotCm = 30;

    // Check each pendulum
    for (const config of pendulumConfigs) {
      const length = config.length || 50;
      const pivotX = p.width / 2 + (config.pivotX - centerPivotCm) * 10;
      const pivotY = 50;
      const bobX = pivotX + length * 10 * Math.sin(config.angle);
      const bobY = pivotY + length * 10 * Math.cos(config.angle);

      // Check if clicking on pivot (priority)
      const distToPivot = p.dist(p.mouseX, p.mouseY, pivotX, pivotY);
      if (distToPivot < 15) {
        isDraggingPivot = true;
        draggedPendulumId = config.id;
        return false;
      }

      // Check if clicking on bob
      const distToBob = p.dist(p.mouseX, p.mouseY, bobX, bobY);
      if (distToBob < 15) {
        isDraggingBob = true;
        draggedPendulumId = config.id;
        return false;
      }
    }
  };

  p.mouseDragged = () => {
    if (!isConfigMode) return;

    const config = pendulumConfigs.find((p) => p.id === draggedPendulumId);
    if (!config) return;

    const centerPivotCm = 30;

    if (isDraggingPivot) {
      // Update pivotX based on mouse position
      const newPivotXPixels = p.mouseX;
      const newPivotXCm = centerPivotCm + (newPivotXPixels - p.width / 2) / 10;
      // Constrain pivotX between 0 and 75 cm
      config.pivotX = Math.max(0, Math.min(75, Math.round(newPivotXCm * 10) / 10));
      return false;
    } else if (isDraggingBob) {
      // Update angle based on mouse position
      const pivotX = p.width / 2 + (config.pivotX - centerPivotCm) * 10;
      const pivotY = 50;
      const dx = p.mouseX - pivotX;
      const dy = p.mouseY - pivotY;
      config.angle = Math.atan2(dx, dy);
      return false;
    }
  };

  p.mouseReleased = () => {
    // Update selected pendulum when drag ends
    if (draggedPendulumId !== null) {
      selectedPendulumId = draggedPendulumId;
      updatePendulumSettings();
    }

    isDraggingBob = false;
    isDraggingPivot = false;
    draggedPendulumId = null;
  };
};

new p5(sketch, document.getElementById("canvas-container"));

// Polling function
async function poll() {
  try {
    const state = await apiClient.getState();
    pendulumData = state;
  } catch (error) {
    console.error("Failed to fetch state:", error);
  }
}

// Start polling
function startPolling() {
  if (!isPolling) {
    isPolling = true;
    pollIntervalId = setInterval(poll, POLLING_INTERVAL);
    console.log("Polling started");
  }
}

// Stop polling
function stopPolling() {
  if (isPolling) {
    isPolling = false;
    clearInterval(pollIntervalId);
    pollIntervalId = null;
    console.log("Polling stopped");
  }
}

// Button event listeners
document
  .getElementById("apply-config-btn")
  .addEventListener("click", async () => {
    try {
      const applyBtn = document.getElementById("apply-config-btn");
      const originalText = applyBtn.textContent;

      // Disable button and show loading state
      applyBtn.disabled = true;
      applyBtn.textContent = "Applying...";

      console.log("Applying configuration...");

      // Send configuration for each pendulum
      for (const config of pendulumConfigs) {
        const apiConfig = {
          pivotX: config.pivotX,
          angle: config.angle,
          mass: config.mass,
          length: config.length,
          gravity: config.gravity,
        };

        console.log(`Configuring pendulum ${config.id}:`, apiConfig);
        await apiClient.configure(config.id, apiConfig);
      }

      // Fake loading delay (3 seconds)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Exit config mode
      isConfigMode = false;
      console.log("Configuration applied successfully");

      // Enable Start, disable Stop
      document.getElementById("start-btn").disabled = false;
      document.getElementById("stop-btn").disabled = true;

      // Hide pendulum settings
      document.getElementById("pendulum-settings-header").style.display = "none";
      document.getElementById("pendulum-settings-panel").style.display = "none";

      // Update pendulum count buttons (disable them)
      updatePendulumCountDisplay();

      // Re-enable apply button and restore text
      applyBtn.disabled = false;
      applyBtn.textContent = originalText;
    } catch (error) {
      console.error("Failed to apply configuration:", error);
      alert("Failed to apply configuration. Check console for details.");

      // Re-enable button on error
      const applyBtn = document.getElementById("apply-config-btn");
      applyBtn.disabled = false;
      applyBtn.textContent = "Apply Config";
    }
  });

document.getElementById("start-btn").addEventListener("click", async () => {
  if (isConfigMode) {
    alert("Please apply configuration first");
    return;
  }

  try {
    await apiClient.control("start");
    startPolling();

    // Disable Start, enable Stop
    document.getElementById("start-btn").disabled = true;
    document.getElementById("stop-btn").disabled = false;

    console.log("Simulation started");
  } catch (error) {
    console.error("Failed to start:", error);
  }
});

document.getElementById("stop-btn").addEventListener("click", async () => {
  if (isConfigMode) {
    alert("Please apply configuration first");
    return;
  }

  try {
    await apiClient.control("stop");
    stopPolling();

    // Enable Start, disable Stop
    document.getElementById("start-btn").disabled = false;
    document.getElementById("stop-btn").disabled = true;

    console.log("Simulation stopped");
  } catch (error) {
    console.error("Failed to stop:", error);
  }
});

document.getElementById("reset-btn").addEventListener("click", async () => {
  try {
    // Call server reset endpoint to kill all instances
    const result = await apiClient.reset();
    console.log("Server reset:", result);

    // Reset to default configurations
    pendulumConfigs = JSON.parse(JSON.stringify(DEFAULT_CONFIGS));

    // Go back to config mode
    isConfigMode = true;

    // Stop polling if active
    stopPolling();

    // Clear pendulum data
    pendulumData = null;

    // Disable both Start and Stop in config mode
    document.getElementById("start-btn").disabled = true;
    document.getElementById("stop-btn").disabled = true;

    // Show pendulum settings
    document.getElementById("pendulum-settings-header").style.display = "block";
    document.getElementById("pendulum-settings-panel").style.display = "block";

    // Update pendulum count display
    updatePendulumCountDisplay();

    console.log("Reset to default configuration");
  } catch (error) {
    console.error("Failed to reset system:", error);
    // Still reset UI even if server reset fails
    pendulumConfigs = JSON.parse(JSON.stringify(DEFAULT_CONFIGS));
    isConfigMode = true;
    stopPolling();
    pendulumData = null;
    document.getElementById("start-btn").disabled = true;
    document.getElementById("stop-btn").disabled = true;
    document.getElementById("pendulum-settings-header").style.display = "block";
    document.getElementById("pendulum-settings-panel").style.display = "block";
    updatePendulumCountDisplay();
  }
});

// Add pendulum button
document.getElementById("add-pendulum-btn").addEventListener("click", () => {
  // Create new pendulum
  const newId = pendulumConfigs.length;
  const newPendulum = {
    id: newId,
    pivotX: 10 + newId * 10, // Space them 10cm apart
    angle: 0,
    color: PENDULUM_COLORS[newId % PENDULUM_COLORS.length],
    mass: 1.5,
    length: 30,
    radius: 2,
    gravity: 9.81,
  };

  pendulumConfigs.push(newPendulum);
  updatePendulumCountDisplay();

  console.log(`Added pendulum #${newId}`);
});

// Remove pendulum button
document.getElementById("remove-pendulum-btn").addEventListener("click", () => {
  const removed = pendulumConfigs.pop();
  updatePendulumCountDisplay();

  console.log(`Removed pendulum #${removed.id}`);
});

// Update pendulum count display and button states
function updatePendulumCountDisplay() {
  const count = pendulumConfigs.length;
  document.getElementById("pendulum-count-display").textContent = count;

  // Disable/enable buttons based on count and config mode
  if (isConfigMode) {
    document.getElementById("remove-pendulum-btn").disabled = count <= 1;
    document.getElementById("add-pendulum-btn").disabled = count >= 5;
  } else {
    // Disable both buttons when not in config mode
    document.getElementById("remove-pendulum-btn").disabled = true;
    document.getElementById("add-pendulum-btn").disabled = true;
  }
}

// Update pendulum settings panel
function updatePendulumSettings() {
  const pendulum = pendulumConfigs.find(p => p.id === selectedPendulumId);
  if (!pendulum) return;

  // Update display with color
  const selectedPendulumEl = document.getElementById("selected-pendulum");
  selectedPendulumEl.textContent = `Pendulum #${pendulum.id}`;
  selectedPendulumEl.style.color = `rgb(${pendulum.color[0]}, ${pendulum.color[1]}, ${pendulum.color[2]})`;

  // Update sliders and values
  document.getElementById("mass-slider").value = pendulum.mass;
  document.getElementById("mass-value").textContent = pendulum.mass.toFixed(1);

  document.getElementById("length-slider").value = pendulum.length;
  document.getElementById("length-value").textContent = pendulum.length;

  // Update gravity selector (default to Earth if not set)
  document.getElementById("gravity-select").value = pendulum.gravity || 9.81;

  // Update color picker
  const colorIndex = PENDULUM_COLORS.findIndex(c =>
    c[0] === pendulum.color[0] && c[1] === pendulum.color[1] && c[2] === pendulum.color[2]
  );
  document.querySelectorAll(".color-swatch").forEach((swatch, i) => {
    if (i === colorIndex) {
      swatch.classList.add("selected");
    } else {
      swatch.classList.remove("selected");
    }
  });
}

// Mass slider
document.getElementById("mass-slider").addEventListener("input", (e) => {
  if (!isConfigMode) return;
  const value = parseFloat(e.target.value);
  const pendulum = pendulumConfigs.find(p => p.id === selectedPendulumId);
  if (pendulum) {
    pendulum.mass = value;
    document.getElementById("mass-value").textContent = value.toFixed(1);
  }
});

// Length slider
document.getElementById("length-slider").addEventListener("input", (e) => {
  if (!isConfigMode) return;
  const value = parseInt(e.target.value);
  const pendulum = pendulumConfigs.find(p => p.id === selectedPendulumId);
  if (pendulum) {
    pendulum.length = value;
    document.getElementById("length-value").textContent = value;
  }
});

// Gravity selector
document.getElementById("gravity-select").addEventListener("change", (e) => {
  if (!isConfigMode) return;
  const value = parseFloat(e.target.value);
  const pendulum = pendulumConfigs.find(p => p.id === selectedPendulumId);
  if (pendulum) {
    pendulum.gravity = value;
  }
});

// Color picker
document.querySelectorAll(".color-swatch").forEach((swatch, index) => {
  swatch.addEventListener("click", () => {
    if (!isConfigMode) return;
    const pendulum = pendulumConfigs.find(p => p.id === selectedPendulumId);
    if (pendulum) {
      pendulum.color = PENDULUM_COLORS[index];

      // Update selected state
      document.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("selected"));
      swatch.classList.add("selected");
    }
  });
});

// Initialize on load
updatePendulumCountDisplay();
updatePendulumSettings();

// Initialize button states (config mode)
document.getElementById("start-btn").disabled = true;
document.getElementById("stop-btn").disabled = true;

// Health check functionality
let healthCheckInterval = null;

async function checkServerHealth() {
  try {
    const health = await apiClient.checkHealth();
    updateServerStatus(true, health);
  } catch (error) {
    updateServerStatus(false);
  }
}

function updateServerStatus(connected, healthData = null) {
  const statusEl = document.getElementById("server-status");
  const urlEl = document.getElementById("server-url");

  if (connected) {
    statusEl.classList.add("connected");
    statusEl.classList.remove("disconnected");

    if (healthData) {
      const role = healthData.role || "server";
      const instances = healthData.instances || 0;
      urlEl.textContent = `${role} (${instances} instances)`;
    } else {
      urlEl.textContent = "Connected";
    }
  } else {
    statusEl.classList.add("disconnected");
    statusEl.classList.remove("connected");
    urlEl.textContent = "Disconnected";
  }
}

// Start health check
function startHealthCheck() {
  // Immediate check
  checkServerHealth();

  // Periodic checks
  healthCheckInterval = setInterval(checkServerHealth, HEALTH_CHECK_INTERVAL);
}

// Stop health check
function stopHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// Start health check on load
startHealthCheck();
