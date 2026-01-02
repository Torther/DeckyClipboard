# Decky Clipboard

[English](README.md) | [简体中文](README.zh_CN.md)

A simple Decky Loader plugin to share your Steam Deck's clipboard with any device on your local network via a web interface.

## Preview

![Preview 1](img/01.jpg)
![Preview 2](img/02.jpg)
![Preview 3](img/03.jpg)

## Usage

1. Install the plugin and open the Quick Access Menu (`...`).
2. Find **Decky Clipboard** and note the displayed URL (e.g., `http://your-ip:8765`).
3. Open the URL on your phone or computer.
4. Start syncing!

## Technical & Credits

- **Backend**: Python `aiohttp` server.
- **Clipboard**: Uses a bundled `xclip` binary for clipboard operations.
- **Frontend**: React (Decky UI) and Vanilla JS (Web Interface).

## License

This project is licensed under the [BSD 3-Clause License](LICENSE).

This project bundles `xclip`, which is licensed under the [GPL-2.0 License](bin/LICENSE.xclip).
Source code for xclip can be found at [https://github.com/astrand/xclip](https://github.com/astrand/xclip).

