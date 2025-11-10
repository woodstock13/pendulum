# Pendulum

A project with a server and UI component.

## Project Structure

- `server/` - Backend server component
- `ui/` - Frontend UI component

## Getting Started

### Prerequisites

- Node.js (v16 or higher recommended)
- npm or yarn

- Use on your machine locally `Mosquito` for MQTT broker.

```bash
# macOS (via Homebrew)
brew install mosquitto
brew services start mosquitto
```

### Server

```bash
cd server
npm install
npm start
```

> More in [Documentation-server.md](https://github.com/woodstock13/pendulum/blob/main/server/DOCUMENTATION.md)

### UI

```bash
cd ui
npm install
npm run dev
```

> More in [Documentation-ui.md](https://github.com/woodstock13/pendulum/blob/main/ui/README.md)

## License

MIT
