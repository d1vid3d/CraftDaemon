# CraftDaemon
A systemd-powered Discord bot for controlling and monitoring Minecraft servers.

A self-hosted Discord bot for managing a Minecraft server using systemd and RCON.

## Features
- Start/Stop server via Discord
- Check server status
- Broadcast messages
- Uses systemctl instead of spawning processes

## Requirements
- Linux (systemd)
- Node.js
- Minecraft server with RCON enabled

## Setup
1. Clone repo
2. Run `npm install`
3. Copy `.env.example` → `.env` and fill it in
4. Set up your systemd service
5. Run the bot

## Notes
This is not plug-and-play. Intended for users familiar with Linux/server hosting.
