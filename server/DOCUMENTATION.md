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
│  │  Collision Detection Layer                 │ │
│  │  • O(n²) pair-wise distance checks        │ │
│  │  • Auto-stop colliding pendulums          │ │
│  │  • Log collision coordinates & IDs         │ │
│  └───────────────────────────────────────────┘ │
└──────────────┬────────┬────────┬────────┬──────┘
               │        │        │        │
       ┌───────┴──┐ ┌───┴────┐ ┌┴────┐ ┌┴────┐
       │Instance#0│ │Instance│ │ ... │ │Inst │
       │Port:3001 │ │  #1    │ │     │ │ #4  │
       │          │ │Port:3002│ │     │ │:3005│
       └──────────┘ └─────────┘ └─────┘ └─────┘
```

### Directory Structure

```
server/
├── src/
│   ├── master-server.ts           # Master orchestrator (290 lines)
│   ├── pendulum-server.ts         # Instance server (200 lines)
│   └── simulation/
│       └── pendulum-simulation.ts # Physics engine (142 lines)
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript configuration
└── example-config.json            # Sample configurations
```

### Core Components

#### 1. Master Server (`master-server.ts`)
**Responsibilities:**
- Spawn 5 instance servers on startup
- Route HTTP requests to appropriate instances
- Aggregate state from all configured instances
- Detect collisions between pendulums
- Handle graceful shutdown and cleanup

**Key Data Structures:**
```typescript
interface PendulumProcess {
  id: number;              // 0-4
  port: number;            // 3001-3005
  process: ChildProcess;   // Node.js child process handle
  configured: boolean;     // Has /configure been called?
  isRunning: boolean;      // Is simulation loop active?
}

const pendulumProcesses = new Map<number, PendulumProcess>();
```

#### 2. Instance Server (`pendulum-server.ts`)
**Responsibilities:**
- Run a single pendulum simulation
- Expose REST API for configuration & control
- Execute physics timestep at 60 FPS
- Report state on demand

**Lifecycle States:**
```
Created → Configured → Running → Stopped
   ↑          ↓          ↓         ↓
   └──────────┴──────────┴─────────┘
              (can reconfigure)
```

#### 3. Physics Simulation (`pendulum-simulation.ts`)
**Responsibilities:**
- Model simple pendulum dynamics
- Calculate 2D position from angle
- Detect collisions with other pendulums
- Track simulation progress

---

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

### ✅ Flexible Configuration
- **Physics Parameters:** Mass, length, gravity, initial angle
- **Visual Properties:** Pivot position, color (UI-managed)
- **Simulation Duration:** Configurable max time (default 60s)
- **Runtime Updates:** Reconfigure without restarting server

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

### State Polling & Collision Detection

```
Client Request:
GET /state (every 100ms)
    │
    ▼
┌──────────────────────────────────┐
│ Master: Loop configured instances│
└──────────┬───────────────────────┘
           │
           ├─→ GET http://localhost:3001/state
           ├─→ GET http://localhost:3002/state
           └─→ ...
           │
           ▼
┌──────────────────────────────────┐
│ Master: Aggregate responses      │
│ pendulums = [{id, pivotX, angle, │
│              length, ...}, ...]  │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Master: detectCollisions()       │
│ For each pair (i, j):            │
│   Calculate positions            │
│   Check distance < 4cm           │
│   If collision:                  │
│     • Log details                │
│     • Stop both pendulums        │
└──────────┬───────────────────────┘
           │
           ▼
Response:
{
  "pendulums": [...],
  "time": 2.5,
  "isRunning": true,
  "collisionDetected": false
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

### Collision Detection Data Flow

```
Master GET /state endpoint
    ↓
Fetch state from all configured instances
    ↓
pendulums[] = [{id, pivotX, angle, length}, ...]
    ↓
detectCollisions(pendulums)
    ↓
For each pair (i, j):
    ├─ pos1 = {x: pivotX1 + length1*sin(θ1), y: length1*(1-cos(θ1))}
    ├─ pos2 = {x: pivotX2 + length2*sin(θ2), y: length2*(1-cos(θ2))}
    ├─ distance = sqrt((x1-x2)² + (y1-y2)²)
    └─ if distance < 4cm:
           ├─ console.log(collision details)
           ├─ POST /stop to instance i
           ├─ POST /stop to instance j
           └─ collisionDetected = true
    ↓
Return collisionDetected flag
```

### Reset Data Flow

```
Client: POST /reset
    ↓
Master: Loop configured instances
    ↓
For each instance:
    ├─ POST /stop to instance
    ├─ pendulum.isRunning = false
    └─ pendulum.configured = false  ← Clears for next session
    ↓
Response: {success, stoppedIds[]}
```

---

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
  "action": "start"  // or "stop"
}
```

**Response:**
```json
{
  "success": true,
  "action": "start",
  "results": [
    {"id": 0, "success": true},
    {"id": 1, "success": true}
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

### Numerical Integration (Euler Method)

```typescript
const dt = 0.016667;  // 60 FPS timestep

// 1. Calculate acceleration
const acceleration = -(gravity * 100 / length) * Math.sin(angle);

// 2. Update velocity
angularVelocity += acceleration * dt;

// 3. Update angle
angle += angularVelocity * dt;

// 4. Increment time
time += dt;
```

### 2D Position Calculation

Bob position in Cartesian coordinates:

```typescript
const x = pivotX + length * Math.sin(angle);
const y = length * (1 - Math.cos(angle));
```

**Geometry:**
- Pivot at `(pivotX, 0)`
- Angle `θ` measured from vertical (downward = 0)
- Positive angle → clockwise rotation
- Position calculated using trigonometry

### Collision Detection Algorithm

```typescript
const COLLISION_RADIUS = 2;  // cm per bob
const MIN_COLLISION_DISTANCE = 4;  // 2 × radius

// For each pair of pendulums:
const dx = pos1.x - pos2.x;
const dy = pos1.y - pos2.y;
const distance = Math.sqrt(dx * dx + dy * dy);

if (distance < MIN_COLLISION_DISTANCE) {
  // Collision detected!
  console.log(`🔴 COLLISION: Pendulum ${id1} vs ${id2}`);
  console.log(`  Position 1: (${pos1.x.toFixed(2)}, ${pos1.y.toFixed(2)})`);
  console.log(`  Position 2: (${pos2.x.toFixed(2)}, ${pos2.y.toFixed(2)})`);
  console.log(`  Distance: ${distance.toFixed(2)}cm`);

  // Stop both pendulums
  await forwardToInstance(id1, '/stop', 'POST');
  await forwardToInstance(id2, '/stop', 'POST');
}
```

### Physics Assumptions & Limitations

**Assumptions:**
- Point mass bob (no radius consideration in physics)
- Massless, rigid string
- No air resistance
- No friction at pivot
- Single degree of freedom
- Energy conservation (no damping)

**Limitations:**
- Not suitable for large angles (small angle approximation not used)
- No chaotic behavior modeling (double pendulum)
- Collision response is instantaneous stop (non-physical)
- No momentum transfer during collision

---

## Design Decisions

### Why Master-Worker Architecture?

**Pros:**
- ✅ **True Parallelism:** Each instance runs in separate process
- ✅ **Process Isolation:** Crash in one instance doesn't affect others
- ✅ **Scalability:** Easy to distribute across machines
- ✅ **Resource Management:** OS-level scheduling and memory isolation

**Cons:**
- ❌ **Overhead:** Process spawning and IPC communication
- ❌ **Complexity:** More code for process management
- ❌ **State Synchronization:** Master must aggregate state

**Alternative Considered:** Single-process with multiple simulations
- Rejected because: No true parallelism, shared memory vulnerabilities

### Why Polling Instead of WebSockets?

**Current:** HTTP polling every 100ms

**Pros:**
- ✅ **Simplicity:** Standard REST API, no special protocols
- ✅ **Stateless:** No connection management needed
- ✅ **Compatible:** Works with any HTTP client

**Cons:**
- ❌ **Latency:** 100ms delay between updates
- ❌ **Overhead:** More HTTP requests

**Future Enhancement:** WebSocket support for real-time push updates

### Why Centralized Collision Detection?

**Current:** Master calculates collisions on `/state` requests

**Pros:**
- ✅ **Single Source of Truth:** One component responsible
- ✅ **Simple Implementation:** No inter-instance communication
- ✅ **Easy Debugging:** All collision logic in one place

**Cons:**
- ❌ **Bottleneck:** Master must fetch all states before detecting
- ❌ **Latency:** Detection only happens during polling

**Alternative Considered:** Distributed detection at instance level
- Rejected because: Requires complex state sharing between instances

### Why TypeScript?

**Pros:**
- ✅ **Type Safety:** Catch errors at compile time
- ✅ **IDE Support:** Better autocomplete and refactoring
- ✅ **Documentation:** Interfaces serve as documentation
- ✅ **Maintainability:** Easier to understand complex data structures

**Cons:**
- ❌ **Build Step:** Requires compilation (mitigated by `tsx`)
- ❌ **Learning Curve:** Team must know TypeScript

### Why Express.js?

**Pros:**
- ✅ **Mature Ecosystem:** Well-tested, extensive middleware
- ✅ **Simplicity:** Minimal boilerplate for REST APIs
- ✅ **Performance:** Fast enough for this use case
- ✅ **Familiarity:** Widely adopted in Node.js community

**Cons:**
- ❌ **Not Modern:** Alternatives like Fastify are faster
- ❌ **Callback-Heavy:** Less ergonomic than async/await

---

## System Constraints

### Hard Limits

| Constraint | Value | Reason |
|-----------|-------|--------|
| Max Instances | 5 | Hardcoded `MAX_INSTANCES` |
| Instance Ports | 3001-3005 | Hardcoded `BASE_PORT + id` |
| Master Port | 3000 | Hardcoded in `master-server.ts` |
| Simulation Duration | 60s | Default `maxTime` parameter |
| Physics Timestep | 16.67ms | 60 FPS = 1000/60 ms |
| Collision Radius | 2cm | Hardcoded in `PendulumSimulation` |
| Min Collision Distance | 4cm | 2 × radius |

### Performance Constraints

- **Collision Detection Complexity:** O(n²) - scales poorly beyond 5 instances
- **Network Latency:** 100ms polling interval adds delay
- **Single-Threaded Physics:** Each instance limited by JavaScript event loop
- **State Aggregation:** Master must wait for all HTTP responses

### Configuration Constraints

- **Angle Range:** -π to π radians (UI enforced)
- **Length Range:** 10-70 cm (UI enforced)
- **Mass Range:** 0.1-5.0 kg (UI enforced)
- **Gravity Options:** Earth (9.81), Moon (1.62), Mars (3.71) m/s² (UI enforced)

### Deployment Constraints

- **Single Machine:** All processes run on localhost
- **Port Availability:** Requires ports 3000-3005 free
- **No Persistence:** State lost on restart
- **No Authentication:** Open API (assumes trusted network)

---

## Development Guide

### Prerequisites

- Node.js 20+
- npm or yarn
- TypeScript knowledge
- Basic understanding of child processes

### Installation

```bash
cd server
npm install
```

### Development Scripts

```bash
# Start master server with auto-reload
npm run dev

# Start single instance for debugging
npm run dev:instance

# Build TypeScript to dist/
npm run build

# Run compiled code
npm start

# Lint code
npm run lint
npm run lint:fix

# Format code
npm run format

# Run tests
npm test
npm run test:watch
```

### Environment Variables

```bash
# Override default ports
PORT=3000           # Master port
BASE_PORT=3001      # First instance port

# Override max instances
MAX_INSTANCES=5
```

### Debugging Tips

**1. Check Process Status:**
```bash
lsof -ti:3000-3005  # See which ports are in use
ps aux | grep tsx   # See running instances
```

**2. Test Individual Instance:**
```bash
npm run dev:instance  # Starts single instance on 3001
curl http://localhost:3001/health
```

**3. Monitor Logs:**
```bash
# Master logs all instance stdout/stderr with prefixes:
# [Instance 0:3001] Message from instance 0
# [Instance 1:3002] Message from instance 1
```

**4. Test Collision Detection:**
```bash
# Configure two pendulums close together
curl -X POST http://localhost:3000/configure/0 \
  -H "Content-Type: application/json" \
  -d '{"pivotX": 10, "angle": 0.5, "length": 50, "mass": 1, "gravity": 9.81}'

curl -X POST http://localhost:3000/configure/1 \
  -H "Content-Type: application/json" \
  -d '{"pivotX": 15, "angle": -0.5, "length": 50, "mass": 1, "gravity": 9.81}'

# Start simulation
curl -X POST http://localhost:3000/control \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'

# Poll state and watch for collision logs
curl http://localhost:3000/state
```

### Common Issues

**Issue:** Port already in use
```
Error: listen EADDRINUSE :::3001
```
**Solution:** Kill orphaned process or change port
```bash
lsof -ti:3001 | xargs kill -9
```

**Issue:** Instance exits immediately
```
[Instance 0:3001] Process exited with code 0
```
**Solution:** Check for TypeScript errors or missing dependencies

**Issue:** Collision not detected
```
collisionDetected: false (expected true)
```
**Solution:**
- Verify `length` is included in `/state` response
- Check collision radius (2cm per bob = 4cm total)
- Ensure pendulums are actually close enough

---

## Future Enhancements

### Planned Features

1. **WebSocket Support**
   - Real-time push updates instead of polling
   - Lower latency, reduced HTTP overhead

2. **Distributed Collision Detection**
   - Quad-tree spatial partitioning
   - GPU-accelerated calculations

3. **Physics Model Extensions**
   - Damping coefficient (energy dissipation)
   - Air resistance (velocity-dependent)
   - Elastic collisions with momentum transfer
   - Double pendulum support

4. **Persistence Layer**
   - Database integration (MongoDB/PostgreSQL)
   - Save/load simulation configurations
   - Historical data export

5. **Monitoring & Metrics**
   - Prometheus metrics endpoint
   - Performance profiling
   - Real-time dashboard

6. **Scalability**
   - Increase MAX_INSTANCES beyond 5
   - Load balancing across multiple machines
   - Container orchestration (Docker/Kubernetes)

7. **Testing**
   - Integration tests for API endpoints
   - Load testing for collision detection
   - Physics validation tests

8. **Authentication & Security**
   - JWT-based authentication
   - Rate limiting
   - Input validation & sanitization

---

## Conclusion

The Pendulum Simulation Server demonstrates a robust multi-process architecture for distributed physics simulations. Its master-worker pattern provides clear separation of concerns, process isolation, and centralized collision detection. While optimized for educational/demonstration purposes, the system is extensible and can be scaled for production use cases with appropriate enhancements.

For UI documentation, see `/ui/DOCUMENTATION.md`.

**Project Repository:** `/Users/tomgty/CODES/sandbox/pendulum/`
**Version:** 1.0.0
**Last Updated:** 2025-01-09
