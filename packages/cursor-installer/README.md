# cursor-installer

A utility script to automatically download and install the latest version of the [Cursor](https://cursor.com/) editor on Linux.

## Features

- Automatically downloads the latest version of Cursor for Linux
- Creates desktop entry for easy access
- Skips download if the latest version is already installed
- Handles all necessary file permissions

## Usage

Simply run:

```bash
npx cursor-installer
```

The script will:

1. Check if you already have the latest version installed
2. Download the latest version if needed
3. Set up the proper file permissions
4. Create a desktop entry so you can find Cursor in your applications menu

## Requirements

- Linux operating system
- Bun runtime (^1.2.10)
- Home directory with write permissions

## Development

To develop or modify this package:

```bash
# Clone the repository
git clone https://github.com/yourusername/utility-scripts.git
cd utility-scripts

# Install dependencies
bun install

# Run in development mode
cd packages/cursor-installer
bun run dev
```

## Dependencies

- [@effect/platform](https://github.com/Effect-TS/platform)
- [@effect/platform-bun](https://github.com/Effect-TS/platform)
- [effect](https://github.com/Effect-TS/effect)

## License

MIT (or other applicable license)
