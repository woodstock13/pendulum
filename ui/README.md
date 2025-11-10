# Pendulum Simulation UI - Technical Documentation

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Main Features](#main-features)
4. [Component Interactions](#component-interactions)
5. [Data Flow](#data-flow)
6. [User Interaction Flows](#user-interaction-flows)
7. [Visual Rendering](#visual-rendering)
8. [Design Decisions](#design-decisions)
9. [System Constraints](#system-constraints)
10. [Development Guide](#development-guide)

---

## Overview

The Pendulum Simulation UI is an **interactive web-based visualization and control interface** built with p5.js and vanilla JavaScript. It provides a rich, real-time canvas for configuring, simulating, and monitoring multiple coupled pendulum systems with collision detection visualization.

### Key Technologies

- **Graphics Library:** p5.js 1.7.0 (2D canvas rendering)
- **Build Tool:** Vite 5.0.0 (dev server, HMR, production builds)
- **Language:** Vanilla JavaScript ES6+ (no frameworks)
- **Styling:** CSS3 with custom properties and animations
- **HTTP Client:** Fetch API (browser native)

### Application Modes

The UI operates in two distinct modes:

1. **Configuration Mode:** Interactive drag-and-drop pendulum setup
2. **Simulation Mode:** Real-time physics visualization with collision detection


---

## System Architecture

### High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────┐
│           Browser Window (Vite Dev Server)       │
│           http://localhost:5173                  │
├──────────────────┬───────────────────────────────┤
│                  │                               │
│  Canvas (p5.js)  │   Control Panel (HTML/CSS)    │
│  1200 × 800 px   │   320px sidebar               │
│                  │                               │
│  ┌────────────┐  │   ┌─────────────────────┐    │
│  │ Draw Loop  │  │   │ Configuration       │    │
│  │ @ 60 FPS   │  │   │ • Pendulum count    │    │
│  │            │  │   │ • Settings panel    │    │
│  │ Renders:   │  │   │ • Apply/Reset btns  │    │
│  │ • Pivots   │  │   └─────────────────────┘    │
│  │ • Strings  │  │                               │
│  │ • Bobs     │  │   ┌─────────────────────┐    │
│  │ • Radii    │  │   │ Simulation Controls │    │
│  │ • Labels   │  │   │ • Start/Stop btns   │    │
│  └────────────┘  │   └─────────────────────┘    │
│                  │                               │
│  ┌────────────┐  │   ┌─────────────────────┐    │
│  │ Mouse      │  │   │ Status Display      │    │
│  │ Handlers   │  │   │ • Pendulum count    │    │
│  │            │  │   │ • Status            │    │
│  │ • Drag bob │  │   │ • Collision alert   │    │
│  │ • Drag     │  │   │ • Timeline progress │    │
│  │   pivot    │  │   └─────────────────────┘    │
│  └────────────┘  │                               │
└──────────────────┴───────────────────────────────┘
                   │
                   │ HTTP Polling (100ms)
                   ▼
         ┌────────────────────┐
         │  Master Server API │
         │  localhost:3000    │
         └────────────────────┘
```

### Directory Structure

```
ui/
├── index.html                 # Main HTML with embedded CSS (428 lines)
├── src/
│   ├── main.js               # p5.js app & UI logic (661 lines)
│   ├── api-client.js         # HTTP client wrapper (179 lines)
├── package.json              # Dependencies & scripts
└── vite.config.js            # Vite configuration (implicit)
```

### System Constraints

### Hard Limits

| Constraint          | Value         | Enforced By                              |
| ------------------- | ------------- | ---------------------------------------- |
| Max Pendulums       | 5             | UI button disabled, server MAX_INSTANCES |
| Min Pendulums       | 1             | UI button disabled                       |
| Canvas Size         | 1200 × 800 px | `createCanvas()` in setup                |
| Frame Rate          | 60 FPS        | p5.js default                            |
| Polling Interval    | 100ms         | `setInterval()` in startPolling          |
| Simulation Duration | 60s           | Server maxTime                           |

### UI Constraints

| Parameter | Range     | Unit    | Control      |
| --------- | --------- | ------- | ------------ |
| Mass      | 0.1 - 5.0 | kg      | Slider       |
| Length    | 10 - 70   | cm      | Slider       |
| PivotX    | 0 - 75    | cm      | Drag pivot   |
| Angle     | -π to π   | radians | Drag bob     |
| Gravity   | 3 options | m/s²    | Dropdown     |
| Color     | 5 presets | RGB     | Color picker |

### Visual Constraints

- **Bob Size:** 20 + (mass × 10) pixels (range: 21-70px)
- **Collision Radius:** 40px fixed (4cm at 10px/cm scale)
- **Pivot Size:** 12px diameter
- **String Thickness:** 2px
- **Canvas Border:** 2px

### Performance Constraints

- **Rendering:** 60 FPS on modern browsers
- **State Updates:** 10 FPS (100ms polling)
- **Animation Smoothness:** Dependent on server response time
- **Memory:** Minimal (no heavy data structures)

### Browser Compatibility

- **Modern Browsers:** Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **ES6+ Required:** Arrow functions, async/await, template literals
- **Canvas API:** Required (no fallback)
- **Fetch API:** Required (no XMLHttpRequest fallback)

---

## Main Features

### ✅ Interactive Configuration

**Drag & Drop Editing:**

- **Drag Pivot:** Click and drag gray pivot circles to adjust X position (0-75 cm)
- **Drag Bob:** Click and drag colored bob circles to adjust initial angle
- **Visual Feedback:** Hover effects, dragging highlights (orange/red)
- **Real-time Updates:** Changes immediately reflected on canvas

**Property Controls:**

- **Mass Slider:** 0.1 - 5.0 kg (affects bob size)
- **Length Slider:** 10 - 70 cm (affects string length)
- **Gravity Dropdown:** Earth (9.81), Moon (1.62), Mars (3.71) m/s²
- **Color Picker:** 5 preset colors (cyan, green, purple, orange, pink)

**Pendulum Management:**

- **Add Pendulum:** + button (max 5 instances)
- **Remove Pendulum:** − button (min 1 instance)
- **Apply Config:** Send configuration to server
- **Reset:** Return to initial configuration state

### ✅ Real-Time Visualization

**Canvas Rendering (60 FPS):**

- **Pivot Points:** Gray circles at top (12px diameter)
- **Strings:** Gray lines connecting pivot to bob (2px stroke)
- **Bobs:** Colored circles with mass-based size (20 + mass × 10 px)
- **Collision Radii:** Semi-transparent circles (40px = 4cm @ 10px/cm scale)
- **Labels:** Pendulum ID below each bob

**Coordinate System:**

- **Physical Units:** Centimeters (cm)
- **Screen Mapping:** 10 pixels per cm
- **Origin:** Center of canvas at 30cm pivot position
- **Pivot Y:** Fixed at 50px from top

**Visual States:**

- **Idle:** Normal colors, no stroke
- **Hovering:** White stroke, brighter color
- **Dragging:** Orange (pivot) or red (bob), white stroke
- **Collision:** Red text in status panel

### ✅ Simulation Controls

**Control Flow:**

1. **Configuration Mode:**

   - Add/remove pendulums (1-5 range)
   - Edit properties via sliders & dropdowns
   - Click "Apply Config" to configure server

2. **Transition:**

   - 3-second loading animation
   - Hide configuration UI
   - Enable Start button
   - Enter Simulation Mode

3. **Simulation Mode:**
   - Click "Start" to begin physics simulation
   - Real-time animation at 60 FPS
   - Poll server state every 100ms
   - Click "Stop" to pause
   - Click "Reset" to return to Configuration Mode


## Component Interactions

### Startup Sequence

```
1. Browser loads index.html
   │
   ├─→ 2. Load p5.js library from CDN
   │
   ├─→ 3. Load main.js, api-client.js
   │
   ├─→ 4. p5.js calls setup()
   │      ├─ createCanvas(1200, 800)
   │      ├─ Initialize pendulumConfigs (default 2)
   │      └─ Attach button event listeners
   │
   └─→ 5. p5.js starts draw() loop @ 60 FPS
          └─ Render default pendulums
```

### Configuration to Simulation Flow

```
User edits pendulums in canvas
    │
    ├─ Drag pivot → update pivotX
    ├─ Drag bob → update angle
    ├─ Adjust sliders → update mass/length
    └─ Change dropdown → update gravity
    │
    ▼
User clicks "Apply Config"
    │
    ├─→ For each pendulum in pendulumConfigs:
    │      POST /configure/:id
    │      {pivotX, angle, mass, length, gravity}
    │
    ├─→ Show "Applying..." on button
    │
    ├─→ Wait 3 seconds (fake loading)
    │
    ├─→ Set isConfigMode = false
    │
    ├─→ Hide configuration UI
    │      ├─ Hide pendulum count controls
    │      ├─ Hide settings panel
    │      └─ Disable Add/Remove buttons
    │
    └─→ Enable Start button
```

### Simulation Loop Flow

```
User clicks "Start"
    │
    ├─→ POST /control {action: "start"}
    │      └─ Master broadcasts to all instances
    │         └─ Each instance: setInterval(step, 16.67ms)
    │
    ├─→ Start polling: GET /state every 100ms
    │      │
    │      ├─→ Server aggregates from instances
    │      ├─→ Server detects collisions
    │      └─→ Return {pendulums[], time, isRunning, collisionDetected}
    │
    ├─→ Cache response in pendulumData
    │
    ├─→ p5.js draw() reads pendulumData
    │      ├─ Merge with pendulumConfigs (colors)
    │      ├─ Calculate screen positions
    │      ├─ Render pivots, strings, bobs
    │      └─ Update status display
    │
    └─→ Repeat until stopped or finished
```

### Reset Flow

```
User clicks "Reset"
    │
    ├─→ POST /reset
    │      └─ Server stops all instances
    │      └─ Server clears configured flags
    │
    ├─→ Stop polling (clearInterval)
    │
    ├─→ Clear pendulumData (null)
    │
    ├─→ Reset pendulumConfigs to defaults
    │      └─ 2 pendulums with default settings
    │
    ├─→ Set isConfigMode = true
    │
    ├─→ Show configuration UI
    │      ├─ Show pendulum count controls
    │      ├─ Show settings panel
    │      └─ Enable Add/Remove buttons
    │
    └─→ Disable Start/Stop buttons
```

---

## Data Flow

### Configuration Data Flow

```
┌─────────────────────────────────────────┐
│  User Interaction (drag, slider, etc.)  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  pendulumConfigs[] (local state)        │
│  [{id, pivotX, angle, mass, length,     │
│    gravity, color}, ...]                │
└──────────────┬──────────────────────────┘
               │
               ▼ (on "Apply Config")
┌─────────────────────────────────────────┐
│  POST /configure/:id                    │
│  {pivotX, angle, mass, length, gravity} │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Server: Create PendulumSimulation      │
│  pendulumProcess.configured = true      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Response: {success, instanceId}        │
└─────────────────────────────────────────┘
```

### Simulation State Data Flow

```
┌─────────────────────────────────────────┐
│  Instance: simulation.step() @ 60 FPS  │
│  Updates: angle, ω, time, position     │
└──────────────┬──────────────────────────┘
               │
               ▼ (every 100ms)
┌─────────────────────────────────────────┐
│  UI: GET /state                         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Master: Aggregate from all instances   │
│  detectCollisions(pendulums)            │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Response:                              │
│  {pendulums: [{id, pivotX, angle,       │
│    angularVelocity, length}, ...],      │
│   time, isRunning, collisionDetected}   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  UI: pendulumData = response            │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  p5.js draw() @ 60 FPS                  │
│  Reads pendulumData, renders canvas     │
└─────────────────────────────────────────┘
```

---

## Design Decisions

### Why p5.js Instead of Three.js or Plain Canvas?

**Pros:**

- ✅ **Simplicity:** High-level API for 2D graphics
- ✅ **Productivity:** Less boilerplate than raw Canvas API
- ✅ **Animation Loop:** Built-in `draw()` function at 60 FPS
- ✅ **Mouse Handling:** Easy `mousePressed()`, `mouseDragged()` etc.
- ✅ **Educational:** Widely used in creative coding education

**Cons:**

- ❌ **Bundle Size:** ~1MB from CDN (could be reduced)
- ❌ **Not 3D:** Limited to 2D rendering (Three.js better for 3D)

### Why Polling Instead of WebSockets?

**Current:** HTTP polling every 100ms

**Pros:**

- ✅ **Simple:** Standard Fetch API, no WebSocket library
- ✅ **Stateless:** No connection management
- ✅ **Compatible:** Works with any HTTP server

**Cons:**

- ❌ **Latency:** 100ms delay
- ❌ **Overhead:** More HTTP requests

**Future Enhancement:** Implement WebSocket for real-time push updates

### Why Vanilla JS Instead of React/Vue?

**Pros:**

- ✅ **Simplicity:** No framework overhead
- ✅ **Direct DOM Access:** Easy integration with p5.js
- ✅ **Learning:** Good for understanding fundamentals
- ✅ **Performance:** No virtual DOM overhead

**Cons:**

- ❌ **State Management:** Manual tracking of variables
- ❌ **Component Reuse:** No component abstraction
- ❌ **Scaling:** Harder to maintain for large apps

---

## Conclusion

The Pendulum Simulation UI demonstrates modern web development practices with vanilla JavaScript and p5.js. Its dual-mode design (configuration vs. simulation) provides an intuitive user experience, while real-time canvas rendering offers smooth, interactive visualization of complex physics simulations. The system is extensible and serves as a solid foundation for educational physics demonstrations.

For server documentation, see `/server/DOCUMENTATION.md`.

**Project Repository:** `/Users/tomgty/CODES/sandbox/pendulum/`
**Version:** 1.0.0
**Last Updated:** 2025-01-09
