# cursor-installer

[![npm](https://img.shields.io/npm/v/cursor-installer)](https://www.npmjs.com/package/cursor-installer)

Downloads and installs the latest [Cursor](https://cursor.com/) editor on Linux.

## Usage

```bash
npx cursor-installer@latest
```

Pass `--yes` (or `-y`) to skip all confirmation prompts:

```bash
npx cursor-installer@latest --yes
```

What it does:

- Checks your installed version and skips the download if it's current
- Downloads the latest AppImage if needed
- Sets file permissions
- Creates a `.desktop` entry
- Adds a `cursor` shell alias

## Requirements

- Linux
- Bun (^1.2.21)

## Built with

- [Bun](https://bun.sh/) + [TypeScript](https://www.typescriptlang.org/)
- [Effect](https://effect.website/)
- [Clack](https://github.com/bombshell-dev/clack)

## License

MIT
