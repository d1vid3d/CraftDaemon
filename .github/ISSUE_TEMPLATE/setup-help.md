---
name: Setup Help
about: Stuck during installation or configuration? Ask for help here.
title: "[HELP]"
labels: question
assignees: ''

---

Before you open an issue make sure to have check the [Full Documentation](https://craftdaemon.arcver.xyz/) on the CraftDaemon website.
And check for [Existing issues](https://github.com/d1vid3d/CraftDaemon/issues?q=is%3Aissue+label%3Asetup) with the `question` label.

## Where Are You Stuck?

<!-- Pick the step that's causing trouble -->
- [ ] Cloning / `npm install`
- [ ] Discord bot application / token
- [ ] `config/.env` configuration
- [ ] Minecraft server as a systemd service
- [ ] Enabling RCON on the Minecraft server
- [ ] sudoers / sudo permissions
- [ ] Registering slash commands
- [ ] Running the bot / systemd service for the bot
- [ ] Post-setup: RBAC / `permission-config.js`
- [ ] Post-setup: Bot is online but a command isn't working
- [ ] Other

## Environment

- **Node.js Version** (`node --version`): 
- **Linux Distribution** (`lsb_release -d`): 

## What Are You Trying to Do, and What's Going Wrong?

<!-- Describe what you're attempting and what's not working. Be specific. -->



## Error Output / Logs

<!-- Paste the exact error message or log output. For systemd issues: `journalctl -u craftdaemon -n 50 --no-pager`. Redact secrets before pasting. -->

```
paste logs here
```

## Relevant Configuration (sanitized)

<!-- Share your .service file, relevant .env variables, or sudoers rule if applicable. NEVER share your bot TOKEN or RCON password. -->

```
paste config here
```

## Quick Checklist

<!-- Confirm you've checked these common gotchas -->
- [ ] I've read the README Troubleshooting section
- [ ] My `config/.env` file exists (not just `config/.env.example`)
- [ ] I've run `npm install` in the CraftDaemon directory
- [ ] My `MC_SERVICE` in `.env` matches the actual systemd service name
- [ ] RCON is enabled in `server.properties` and the password matches `RCON_PASSWORD`
- [ ] I've run `node src/register-commands.js` at least once

## Additional Context

<!-- Hosting environment, VPS provider, non-standard setup, etc. -->
