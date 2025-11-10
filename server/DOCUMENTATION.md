# Pendulum Simulation Server - Technical Documentation

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Main Features](#main-features)
4. [Component Interactions](#component-interactions)
5. [Data Flow](#data-flow)
6. [API Reference](#api-reference)
7. [Physics Engine](#physics-engine)
8. [Design Decisions](#design-decisions)
9. [System Constraints](#system-constraints)
10. [Development Guide](#development-guide)

---

## Overview

The Pendulum Simulation Server is a **distributed multi-process physics simulation platform** built with Node.js, Express, and TypeScript. It implements a **master-worker architecture** to run up to 5 independent pendulum simulations simultaneously, with centralized collision detection and state aggregation.

### Key Technologies

- **Runtime:** Node.js 20+
- **Framework:** Express.js 5.1
- **Language:** TypeScript 5.9 (strict mode)
- **Process Management:** Node.js `child_process` API
- **Physics:** Analytical mechanics (simple pendulum equation)

### Architecture Pattern

```
Master Server (Port 3000)
    ├─ Orchestrates 5 child processes
    ├─ Aggregates state from all instances
    ├─ Detects collisions between pendulums
    └─ Manages lifecycle (spawn/shutdown)

Instance Servers (Ports 3001-3005)
    ├─ Independent physics simulations
    ├─ 60 FPS update loop (16.67ms timestep)
    └─ REST API for configuration & control
```

## Main Features

### ✅ Multi-Instance Management

- **Concurrent Simulations:** Run up to 5 independent pendulum instances
- **Process Isolation:** Each instance in separate Node.js process
- **Dynamic Configuration:** Configure instances at runtime via REST API
- **Health Monitoring:** Track status of all instances

### ✅ Real-Time Collision Detection

- **Automatic Detection:** Check all pendulum pairs every state poll
- **Position-Based:** Uses 2D Cartesian coordinates
- **Collision Response:** Auto-stops colliding pendulums
- **Detailed Logging:** Console logs with coordinates and IDs
- **Distance Formula:** `sqrt((x1-x2)² + (y1-y2)²) < 4cm`

### ✅ Graceful Shutdown & Cleanup

- **Signal Handling:** SIGTERM/SIGINT handlers for clean exit
- **Cascade Shutdown:** Master → SIGTERM children → wait → SIGKILL fallback
- **Orphaned Process Cleanup:** Detect and kill stale processes on startup using `lsof`
- **Exit Safety:** Backup handler for abrupt terminations

### ✅ State Aggregation

- **Centralized State:** Master collects state from all instances
- **Shared Metadata:** time, isRunning, isFinished synchronized
- **Per-Pendulum Data:** angle, position, velocity for each
- **Filtered Response:** Only return configured instances

---

---

## System Architecture

### High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────┐
│         HTTP Clients (UI, API consumers)         │
│              http://localhost:3000               │
└────────────────────┬─────────────────────────────┘
                     │
                     │ REST API
                     ▼
┌─────────────────────────────────────────────────┐
│          MASTER SERVER (Port 3000)              │
│  ┌───────────────────────────────────────────┐ │
│  │  Process Management Layer                  │ │
│  │  • Spawn/Kill instances                    │ │
│  │  • Monitor health & exit events            │ │
│  │  • Graceful shutdown handling              │ │
│  │  • Orphaned process cleanup                │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │  State Aggregation Layer                   │ │
│  │  • Forward requests to instances           │ │
│  │  • Collect & merge responses               │ │
│  │  • Track configured instances              │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │  MQTT Coordination Layer (NEW)             │ │
│  │  • Collision detection (O(n²) checks)     │ │
│  │  • Pub/Sub collision stop/restart         │ │
│  │  • ACK tracking & synchronization          │ │
│  │  • 5-second collision pause coordination   │ │
│  └───────────────────────────────────────────┘ │
└──────────────┬────────┬────────┬────────┬──────┘
               │        │        │        │
               │   HTTP Requests │        │
               ▼        ▼        ▼        ▼
       ┌───────────────────────────────────────┐
       │   MQTT Broker (localhost:1883)        │
       │   Topics: pendulum/collision/*        │
       │            pendulum/ack/*             │
       └───────────────────────────────────────┘
               ▲        ▲        ▲        ▲
               │  MQTT Pub/Sub   │        │
               │        │        │        │
       ┌───────┴──┐ ┌───┴────┐ ┌┴────┐ ┌┴────┐
       │Instance#0│ │Instance│ │ ... │ │Inst │
       │Port:3001 │ │  #1    │ │     │ │ #4  │
       │MQTT ID:  │ │Port:3002│ │     │ │:3005│
       │pendulum-0│ │MQTT ID: │ │     │ │MQTT │
       │          │ │pendulum-1│ │     │ │ID:4 │
       └──────────┘ └─────────┘ └─────┘ └─────┘
```

### Directory Structure

```
server/
├── src/
│   ├── master/                    # Master server components
│   │   ├── config.ts              # Master configuration
│   │   ├── endpoints.ts           # Master API endpoints
│   │   ├── mqtt.ts                # MQTT coordinator & collision detection
│   │   ├── process-manager.ts     # Child process lifecycle management
│   │   └── types.ts               # Master type definitions
│   ├── pendulum/                  # Pendulum instance components
│   │   ├── config.ts              # Instance configuration
│   │   ├── endpoints.ts           # Instance API endpoints
│   │   ├── mqtt.ts                # Instance MQTT message handler
│   │   ├── simulation-manager.ts  # Instance simulation lifecycle
│   │   └── types.ts               # Instance type definitions
│   ├── simulation/                # Core physics engine
│   │   └── pendulum-simulation.ts # Physics calculations
│   ├── master-server.ts           # Master server entry point
│   └── pendulum-server.ts         # Instance server entry point
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript configuration
└── example-config.json            # Sample configurations
```

## API Reference

### Master Server Endpoints (Port 3000)

#### `GET /health`

Health check for master server.

**Response:**

```json
{
  "status": "ok",
  "role": "master",
  "port": 3000,
  "instances": 5,
  "maxInstances": 5,
  "timestamp": "2025-01-09T12:34:56.789Z"
}
```

#### `GET /state`

Aggregate state from all configured instances.

**Response:**

```json
{
  "pendulums": [
    {
      "id": 0,
      "pivotX": 10,
      "angle": 0.654,
      "angularVelocity": -0.123,
      "length": 50
    }
  ],
  "time": 2.5,
  "isFinished": false,
  "isRunning": true,
  "collisionDetected": false
}
```

#### `GET /instances`

List all instance processes.

**Response:**

```json
{
  "instances": [
    {
      "id": 0,
      "port": 3001,
      "configured": true,
      "isRunning": true,
      "pid": 12345
    }
  ],
  "count": 5
}
```

#### `POST /configure/:id`

Configure a specific instance.

**Request Body:**

```json
{
  "pivotX": 10,
  "angle": 0.785,
  "angularVelocity": 0,
  "mass": 1.5,
  "length": 50,
  "gravity": 9.81
}
```

**Response:**

```json
{
  "success": true,
  "instanceId": 0
}
```

#### `POST /control`

Control all configured instances (start/stop).

**Request Body:**

```json
{
  "action": "start" // or "stop"
}
```

**Response:**

```json
{
  "success": true,
  "action": "start",
  "results": [
    { "id": 0, "success": true },
    { "id": 1, "success": true }
  ]
}
```

#### `POST /reset`

Stop all simulations and clear configured state.

**Response:**

```json
{
  "success": true,
  "message": "Stopped 2 simulation(s)",
  "stoppedIds": [0, 1]
}
```

### Instance Server Endpoints (Ports 3001-3005)

#### `GET /health`

Health check for instance.

**Response:**

```json
{
  "status": "ok",
  "instanceId": 0,
  "port": 3001,
  "configured": true,
  "isRunning": true
}
```

#### `GET /state`

Get current simulation state.

**Response:**

```json
{
  "id": 0,
  "pivotX": 10,
  "angle": 0.654,
  "angularVelocity": -0.123,
  "length": 50,
  "time": 2.5,
  "isFinished": false,
  "isRunning": true
}
```

#### `POST /configure`

Configure the pendulum simulation.

**Request Body:** Same as master `/configure/:id`

**Response:**

```json
{
  "success": true,
  "message": "Pendulum configured",
  "instanceId": 0
}
```

#### `POST /start`

Start the simulation loop.

**Response:**

```json
{
  "success": true,
  "message": "Simulation started"
}
```

#### `POST /stop`

Stop the simulation loop.

**Response:**

```json
{
  "success": true,
  "message": "Simulation stopped"
}
```

#### `POST /reset`

Reset simulation to initial state.

**Response:**

```json
{
  "success": true,
  "message": "Simulation reset to initial state"
}
```

---

### Core Components

The architecture is organized into three distinct modules:

#### 1. Master Server Module (`master/`)

**Process Manager (`master/process-manager.ts`)**

**Responsibilities:**

- Spawn 5 instance servers on startup using child processes
- Track process state (PID, configured, running)
- Forward HTTP requests to appropriate instances
- Handle graceful shutdown with SIGTERM/SIGKILL
- Cleanup orphaned processes from previous runs

**Key Data Structures:**

```typescript
interface PendulumProcess {
  id: number; // 0-4
  port: number; // 3001-3005
  process: ChildProcess; // Node.js child process handle
  configured: boolean; // Has /configure been called?
  isRunning: boolean; // Is simulation loop active?
}

const pendulumProcesses = new Map<number, PendulumProcess>();
```

**Key Functions:**

- `spawnAllInstances()` - Spawn 5 instance processes
- `forwardToInstance(id, endpoint, method, body?)` - HTTP request forwarding
- `shutdownAllInstances()` - Graceful shutdown handler
- `cleanupOrphanedProcesses()` - Kill stale processes on startup

---

**Master Endpoints (`master/endpoints.ts`)**

**Responsibilities:**

- Expose REST API for orchestration
- Aggregate state from all configured instances
- Coordinate start/stop/reset across instances
- Trigger collision detection on state polls

**Key Endpoints:**

- `GET /health` - Master server status
- `GET /state` - Aggregate state + collision detection
- `GET /instances` - List all process information
- `POST /configure/:id` - Configure specific instance
- `POST /control` - Start/stop all configured instances
- `POST /reset` - Stop all and clear configuration

---

**MQTT Coordinator (`master/mqtt.ts`)**

**Responsibilities:**

- Centralized collision detection
- Coordinate collision stop-pause-restart protocol
- Track acknowledgments from all instances
- Publish collision commands via MQTT

**Key Functions:**

- `setupMqttCoordinator()` - Initialize MQTT client
- `detectCollisions(pendulums)` - O(n²) collision detection
- `handleInstanceAck(topic, message)` - Process ACKs
- `publishCollisionStop()` - Broadcast stop command
- `publishCollisionRestart()` - Broadcast restart after 5s pause

**State Managed:**

- `isCollisionInProgress` - Prevents concurrent collision handling
- `stoppedInstances` - Set of instance IDs that stopped
- `restartedInstances` - Set of instance IDs that restarted

---

#### 2. Pendulum Instance Module (`pendulum/`)

**Simulation Manager (`pendulum/simulation-manager.ts`)**

**Responsibilities:**

- Manage single pendulum simulation lifecycle
- Run physics update loop at 60 FPS
- Expose control interface (configure, start, stop, reset, getState)
- Track configured and running state

**Key Features:**

- Singleton pattern (one manager per instance process)
- Uses `setInterval` for 60 FPS physics updates
- Stops existing simulation before reconfiguring
- Delegates physics calculations to `PendulumSimulation` class

**Lifecycle States:**

```
Created → Configured → Running → Stopped
   ↑          ↓          ↓         ↓
   └──────────┴──────────┴─────────┘
              (can reconfigure)
```

---

**Instance Endpoints (`pendulum/endpoints.ts`)**

**Responsibilities:**

- Expose REST API for single instance
- Interface with simulation manager
- Return state including 2D position
- Handle configuration changes

**Key Endpoints:**

- `GET /health` - Instance status
- `GET /state` - Current simulation state
- `POST /configure` - Set physics parameters
- `POST /start` - Start simulation loop
- `POST /stop` - Stop simulation loop
- `POST /reset` - Reset to initial conditions

---

**MQTT Handler (`pendulum/mqtt.ts`)**

**Responsibilities:**

- Subscribe to collision coordination messages
- Respond to stop/restart commands
- Publish acknowledgments to master
- Delegate control to simulation manager

**Key Features:**

- Client ID: `pendulum-{INSTANCE_ID}`
- Subscribes to `pendulum/collision/#`
- Only responds if configured
- Publishes ACKs to `pendulum/ack/stopped` and `pendulum/ack/restarted`

---

#### 3. Simulation Engine Module (`simulation/`)

**Pendulum Simulation (`simulation/pendulum-simulation.ts`)**

**Responsibilities:**

- Model simple pendulum dynamics using analytical mechanics
- Calculate 2D position from angle using trigonometry
- Provide pure, stateless physics calculations
- Track simulation time and progress
- Detect simulation completion (time >= maxTime)

**Key Features:**

- Pure class-based design (no side effects)
- Euler integration for numerical solution
- Small-angle approximation NOT used (works for large angles)
- Energy-conserving (no damping)
- 60 FPS update rate (dt = 0.016667s)

---

## Component Interactions

### Startup Sequence

```
1. Master Server Starts (port 3000)
   │
   ├─→ 2. Cleanup Orphaned Processes
   │      └─ Run lsof -ti:3001-3005
   │      └─ Kill any found PIDs
   │
   ├─→ 3. Spawn All 5 Instances
   │      ├─ Instance 0 on port 3001
   │      ├─ Instance 1 on port 3002
   │      ├─ Instance 2 on port 3003
   │      ├─ Instance 3 on port 3004
   │      └─ Instance 4 on port 3005
   │
   ├─→ 4. Attach Process Handlers
   │      ├─ stdout/stderr logging
   │      └─ exit event tracking
   │
   └─→ 5. Setup Shutdown Handlers
          ├─ SIGTERM handler
          ├─ SIGINT handler
          └─ Exit fallback handler
```

### Configuration Flow

```
Client Request:
POST /configure/0
{
  "pivotX": 10,
  "angle": 0.785,
  "mass": 1.5,
  "length": 50,
  "gravity": 9.81
}
    │
    ▼
┌─────────────────┐
│  Master Server  │
│  Validates ID   │
│  (0-4 range)    │
└────────┬────────┘
         │
         │ Forward via HTTP
         ▼
┌─────────────────┐
│ Instance Server │
│ Creates new     │
│ Simulation      │
│ object          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ PendulumSimulation │
│ Stores config   │
│ Initializes     │
│ state           │
└────────┬────────┘
         │
         ▼
Response:
{
  "success": true,
  "instanceId": 0
}
```

### State Polling & Collision Detection (with MQTT)

```
Client Request:
GET /state (every 100ms)
    │
    ▼
┌────────────────────────────────────────┐
│ Master Endpoints: GET /state           │
│ Loop configured instances              │
└──────────┬─────────────────────────────┘
           │
           ├─→ HTTP: GET http://localhost:3001/state
           ├─→ HTTP: GET http://localhost:3002/state
           └─→ HTTP: ...
           │
           ▼
┌────────────────────────────────────────┐
│ Master: Aggregate responses            │
│ pendulums = [{id, pivotX, angle,       │
│              length, position}, ...]   │
└──────────┬─────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────┐
│ MQTT Coordinator: detectCollisions()   │
│ For each pair (i, j):                  │
│   pos1 = calculatePosition(p[i])       │
│   pos2 = calculatePosition(p[j])       │
│   distance = sqrt((x1-x2)² + (y1-y2)²) │
│   If distance < 4cm:                   │
│     • Set isCollisionInProgress=true   │
│     • Log collision details            │
│     • MQTT publish collision/stop      │
│     • Wait for ACKs (blocking)         │
│     • Wait 5 seconds                   │
│     • MQTT publish collision/restart   │
│     • Wait for ACKs (blocking)         │
│     • HTTP POST /control (start)       │
│     • Reset collision state            │
└──────────┬─────────────────────────────┘
           │
           ▼
           │
  ┌────────┴────────┐
  │ If collision:   │
  │ MQTT Pub/Sub    │
  └────────┬────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌─────────────────────────────────────────┐
│ MQTT Topic: pendulum/collision/stop     │
│ All instances subscribe to this         │
└─────────────────────────────────────────┘
           │
    ┌──────┴──────┬──────┬──────┐
    │             │      │      │
    ▼             ▼      ▼      ▼
┌─────────┐ ┌─────────┐  ...  ┌─────────┐
│Instance0│ │Instance1│        │Instance4│
│ Stop    │ │ Stop    │        │ Stop    │
│ Pub ACK │ │ Pub ACK │        │ Pub ACK │
└─────────┘ └─────────┘        └─────────┘
           │
           ├─→ MQTT: pendulum/ack/stopped {instanceId: 0}
           ├─→ MQTT: pendulum/ack/stopped {instanceId: 1}
           └─→ ...
           │
           ▼
┌────────────────────────────────────────┐
│ Master: Wait for all ACKs              │
│ stoppedInstances.add(instanceId)       │
│ When size === EXPECTED_INSTANCES:      │
│   • Wait 5 seconds                     │
│   • Publish collision/restart          │
└────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ MQTT Topic: pendulum/collision/restart  │
└─────────────────────────────────────────┘
           │
    ┌──────┴──────┬──────┬──────┐
    │             │      │      │
    ▼             ▼      ▼      ▼
┌─────────┐ ┌─────────┐  ...  ┌─────────┐
│Instance0│ │Instance1│        │Instance4│
│ Restart │ │ Restart │        │ Restart │
│ Pub ACK │ │ Pub ACK │        │ Pub ACK │
└─────────┘ └─────────┘        └─────────┘
           │
           ├─→ MQTT: pendulum/ack/restarted {instanceId: 0}
           ├─→ MQTT: pendulum/ack/restarted {instanceId: 1}
           └─→ ...
           │
           ▼
┌────────────────────────────────────────┐
│ Master: Wait for all restart ACKs      │
│ restartedInstances.add(instanceId)     │
│ When size === EXPECTED_INSTANCES:      │
│   • HTTP POST /control {action:start}  │
│   • Reset isCollisionInProgress=false  │
└────────────────────────────────────────┘
           │
           ▼
Response to Client:
{
  "pendulums": [...],
  "time": 2.5,
  "isRunning": true,
  "collisionDetected": true  // or false
}
```

### Simulation Loop (Instance-Level)

```
POST /start received
    │
    ▼
setInterval(step, 16.67ms)  ← 60 FPS
    │
    ├─→ simulation.step()
    │      ├─ Calculate acceleration
    │      ├─ Update velocity
    │      ├─ Update angle
    │      ├─ Calculate 2D position
    │      └─ Increment time
    │
    ├─→ Check if finished
    │      └─ time >= maxTime? → stop
    │
    └─→ Repeat until stopped
```

---

## Data Flow

### Configuration Data Flow

```
UI Form Input
    ↓
{pivotX, angle, mass, length, gravity}
    ↓
POST /configure/:id
    ↓
Master validates & forwards
    ↓
Instance creates PendulumSimulation
    ↓
pendulumProcess.configured = true
    ↓
Response to UI
```

### Simulation State Data Flow

```
Instance: simulation.step()
    ↓
Updates internal state {angle, ω, t, position}
    ↓
GET /state request from Master
    ↓
Instance responds with current state
    ↓
Master aggregates from all instances
    ↓
Master runs collision detection
    ↓
Master responds to client
    ↓
UI renders at 60 FPS
```

## MQTT Communication Architecture

The system uses **MQTT (Message Queuing Telemetry Transport)** as a publish-subscribe messaging protocol for coordinating collision detection and recovery across distributed pendulum instances.

### MQTT Broker Configuration

**Broker Details:**

- **URL:** `mqtt://localhost:1883`
- **Protocol:** MQTT v3.1.1
- **Authentication:** None (localhost only)
- **Deployment:** Local broker (Mosquitto recommended)

**Connection Pattern:**

- Master server connects as coordinator
- Each instance connects with unique client ID: `pendulum-{INSTANCE_ID}`
- Persistent connections maintained throughout lifecycle

### Topic Structure

The system uses a hierarchical topic structure for collision coordination:

#### Master Publisher Topics

- `pendulum/collision/stop` - Broadcast collision detection to all instances
- `pendulum/collision/restart` - Signal instances to restart after collision pause

#### Instance Publisher Topics

- `pendulum/ack/stopped` - Acknowledge successful stop
- `pendulum/ack/restarted` - Acknowledge successful restart

#### Subscription Patterns

- **Master subscribes to:** `pendulum/ack/#` (wildcard for all acknowledgments)
- **Instances subscribe to:** `pendulum/collision/#` (wildcard for all collision commands)

### Message Payloads

#### Collision Stop Message

```json
{
  "type": "stop",
  "reason": "collision",
  "timestamp": 1641234567890
}
```

**QoS Level:** 1 (At least once delivery)

#### Collision Restart Message

```json
{
  "type": "restart",
  "timestamp": 1641234567890
}
```

**QoS Level:** 1 (At least once delivery)

#### Acknowledgment Messages

```json
{
  "instanceId": 0,
  "status": "stopped" // or "restarted"
}
```

**QoS Level:** 0 (Fire and forget - ACKs are tracked by count)

### Collision Coordination Protocol

The collision detection and recovery follows a **synchronized stop-pause-restart protocol**:

#### Phase 1: Collision Detection (Master)

1. Master polls `/state` from all configured instances
2. Calculates pairwise distances between all pendulum bobs
3. If any distance < 4cm:
   - Sets `isCollisionInProgress = true`
   - Publishes `stop` message to `pendulum/collision/stop`
   - Initializes empty `stoppedInstances` Set
   - Waits for all configured instances to ACK

#### Phase 2: Instance Stop (Instances)

1. Receive `stop` message on `pendulum/collision/stop`
2. Stop simulation loop (if running)
3. Publish ACK to `pendulum/ack/stopped` with instance ID
4. Enter waiting state

#### Phase 3: ACK Tracking (Master)

1. Master receives ACK on `pendulum/ack/stopped`
2. Adds instance ID to `stoppedInstances` Set
3. When `stoppedInstances.size === EXPECTED_INSTANCES`:
   - All instances have stopped
   - Proceed to pause phase

#### Phase 4: Collision Pause (Master)

1. Wait exactly **5 seconds** (configurable delay)
2. Allows collision to be visually observed
3. Clears `stoppedInstances` Set
4. Initializes `restartedInstances` Set

#### Phase 5: Restart Broadcast (Master)

1. Publishes `restart` message to `pendulum/collision/restart`
2. Waits for all instances to ACK restart

#### Phase 6: Instance Restart (Instances)

1. Receive `restart` message on `pendulum/collision/restart`
2. Restart simulation loop (if configured)
3. Publish ACK to `pendulum/ack/restarted` with instance ID

#### Phase 7: Resume Control (Master)

1. Master receives ACK on `pendulum/ack/restarted`
2. Adds instance ID to `restartedInstances` Set
3. When `restartedInstances.size === EXPECTED_INSTANCES`:
   - All instances have restarted
   - Call master's `/control` endpoint with `action: "start"`
   - Reset `isCollisionInProgress = false`
   - Clear both ACK Sets

### ACK Tracking Mechanism

**Why ACK Tracking:**

- Ensures all instances respond before proceeding
- Prevents race conditions in distributed stop/start
- Guarantees synchronized collision recovery

**Implementation:**

```typescript
const stoppedInstances = new Set<number>();
const restartedInstances = new Set<number>();

// When ACK received:
stoppedInstances.add(instanceId);

// Check if all instances responded:
if (stoppedInstances.size === EXPECTED_INSTANCES) {
  // All instances stopped - proceed to next phase
}
```

**Edge Cases Handled:**

- Duplicate ACKs (Set prevents double-counting)
- Unconfigured instances (don't send ACKs)
- Out-of-order ACKs (Set tracks by ID, not order)

### MQTT Component Responsibilities

#### Master MQTT Coordinator (`master/mqtt.ts`)

**Role:** Central collision detection and recovery orchestration

**Key Functions:**

- `setupMqttCoordinator()` - Initialize MQTT connection and subscriptions
- `detectCollisions(pendulums)` - Calculate distances and trigger stop
- `handleInstanceAck(topic, message)` - Process ACKs and coordinate phases
- `publishCollisionStop()` - Broadcast stop command
- `publishCollisionRestart()` - Broadcast restart command after pause

**State Managed:**

- `isCollisionInProgress` - Prevents overlapping collision handling
- `stoppedInstances` - Tracks which instances stopped
- `restartedInstances` - Tracks which instances restarted

**Dependencies:**

- Requires MQTT broker running on localhost:1883
- Integrates with master's `/control` endpoint for final resume

#### Instance MQTT Handler (`pendulum/mqtt.ts`)

**Role:** Respond to collision coordination commands

**Key Functions:**

- `setupMqttHandler(instanceId)` - Initialize instance MQTT connection
- `handleCollisionMessage(topic, message)` - Process stop/restart commands
- `publishAck(status, instanceId)` - Send acknowledgments to master

**Behavior:**

- Only responds if instance is configured
- Restart only occurs if instance was stopped (prevents double-start)
- Always publishes ACK to maintain master's count
- Delegates simulation control to `simulationManager`

**Client ID Pattern:** `pendulum-{INSTANCE_ID}` (e.g., `pendulum-0`, `pendulum-1`)

### QoS (Quality of Service) Levels

**QoS 1 for Critical Messages:**

- `pendulum/collision/stop` - Must be received by all instances
- `pendulum/collision/restart` - Must be received by all instances
- Guarantees at-least-once delivery
- Broker stores message until acknowledged

**QoS 0 for Acknowledgments:**

- `pendulum/ack/stopped` - Fire and forget
- `pendulum/ack/restarted` - Fire and forget
- Lower overhead for high-frequency messages
- Master tracks by count, not individual delivery

### Collision Detection Algorithm

```typescript
const COLLISION_RADIUS = 2; // cm (per bob)
const MIN_COLLISION_DISTANCE = 4; // 2 × radius

for (let i = 0; i < pendulums.length; i++) {
  for (let j = i + 1; j < pendulums.length; j++) {
    const pos1 = calculatePosition(pendulums[i]);
    const pos2 = calculatePosition(pendulums[j]);

    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < MIN_COLLISION_DISTANCE) {
      console.log(`🔴 COLLISION DETECTED`);
      console.log(`  Pendulum ${pendulums[i].id} vs ${pendulums[j].id}`);
      console.log(`  Distance: ${distance.toFixed(2)}cm`);

      // Trigger MQTT stop sequence
      publishCollisionStop();
      return true; // collisionDetected
    }
  }
}
```

**Position Calculation:**

```typescript
const x = pivotX + length * Math.sin(angle);
const y = length * (1 - Math.cos(angle));
```

---

## Physics Engine

### Simple Pendulum Equation

The simulation uses the **equation of motion for a simple pendulum**:

```
θ'' = -(g/L) × sin(θ)

Where:
  θ   = angle from vertical (radians)
  θ'  = dθ/dt = angular velocity (rad/s)
  θ'' = d²θ/dt² = angular acceleration (rad/s²)
  g   = gravitational acceleration (cm/s²)
  L   = pendulum length (cm)
```

**Current:** Master calculates collisions on `/state` requests

**Pros:**

- ✅ **Single Source of Truth:** One component responsible
- ✅ **Simple Implementation:** No inter-instance communication needed for detection
- ✅ **Easy Debugging:** All collision logic in one place
- ✅ **Global View:** Master has complete pendulum positions in one place

**Cons:**

- ❌ **Bottleneck:** Master must fetch all states before detecting
- ❌ **Latency:** Detection only happens during polling
- ❌ **O(n²) Complexity:** Doesn't scale beyond small number of instances

**Alternative Considered:** Distributed detection at instance level

- Rejected because: Requires complex state sharing between instances, harder to coordinate recovery

## System Constraints

### Hard Limits

| Constraint             | Value     | Reason                            |
| ---------------------- | --------- | --------------------------------- |
| Max Instances          | 5         | Hardcoded `MAX_INSTANCES`         |
| Instance Ports         | 3001-3005 | Hardcoded `BASE_PORT + id`        |
| Master Port            | 3000      | Hardcoded in `master-server.ts`   |
| Simulation Duration    | 60s       | Default `maxTime` parameter       |
| Physics Timestep       | 16.67ms   | 60 FPS = 1000/60 ms               |
| Collision Radius       | 2cm       | Hardcoded in `PendulumSimulation` |
| Min Collision Distance | 4cm       | 2 × radius                        |

## Development Guide

### Prerequisites

- **Node.js:** 20+ (LTS recommended)
- **npm or yarn:** Package manager
- **MQTT Broker:** Mosquitto, EMQX, or any MQTT v3.1.1 compatible broker
- **TypeScript knowledge:** Familiarity with TypeScript syntax
- **Understanding of:**
  - Node.js child processes
  - MQTT pub/sub messaging
  - REST API design
  - Basic physics (pendulum motion)

---

## Conclusion

The Pendulum Simulation Server demonstrates a robust multi-process architecture for distributed physics simulations. Its master-worker pattern provides clear separation of concerns, process isolation, and centralized collision detection. While optimized for educational/demonstration purposes, the system is extensible and can be scaled for production use cases with appropriate enhancements.

For UI documentation, see `/ui/DOCUMENTATION.md`.

**Project Repository:** `/Users/tomgty/CODES/sandbox/pendulum/`
**Version:** 1.0.0
**Last Updated:** 2025-01-09
