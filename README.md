# utility-scripts

A collection of utility scripts packaged as separate NPM modules.

## Overview

This monorepo contains various utility scripts implemented as standalone NPM packages to help with different developer tasks.

## Packages

- [cursor-installer](./packages/cursor-installer/README.md): A utility to automatically download and install the latest version of the Cursor editor on Linux.

## Development

This project uses [Bun](https://bun.sh/) as the JavaScript runtime and package manager.

### Prerequisites

- Bun 1.2.10 or higher

### Setup

```bash
# Clone the repository
git clone https://github.com/meteoricprovider/utility-scripts.git
cd utility-scripts

# Install dependencies
bun install
```

### Development Workflow

Each package is contained in the `packages/` directory and can be worked on independently.

```bash
# Run a specific package in development mode
cd packages/cursor-installer
bun run dev
```

## License

MIT
