# Express TypeScript API Server

A basic Node.js Express API server built with TypeScript, ESLint, and Prettier.

## Features

- TypeScript with strict mode
- Express.js for API routing
- ESLint for code linting
- Prettier for code formatting
- Hot reload with tsx watch mode

## Getting Started

### Prerequisites

- Node.js (v16 or higher recommended)
- npm or yarn

### Installation

Dependencies are already installed. If you need to reinstall:

```bash
npm install
```

### Development

Start the development server with hot reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000`.

### Available Endpoints

- `GET /` - Welcome message
- `GET /api/health` - Health check endpoint
- `GET /api/hello/:name` - Personalized greeting

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server (requires build first)
- `npm run lint` - Lint code with ESLint
- `npm run lint:fix` - Fix linting issues automatically
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## Project Structure

```
server/
├── src/
│   └── index.ts          # Main server file
├── dist/                 # Compiled JavaScript (after build)
├── .eslintrc.json       # ESLint configuration
├── .prettierrc          # Prettier configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies and scripts
```

## Development Workflow

1. Make changes to files in `src/`
2. The dev server will automatically reload
3. Run `npm run lint:fix` to fix linting issues
4. Run `npm run format` to format code
5. Build with `npm run build` before deploying

## Building for Production

```bash
npm run build
npm start
```
