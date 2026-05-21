---
name: Bug Report
about: Found a bug or edge cases? Open an issue here.
title: "[BUG]"
labels: bug
assignees: ''

---

## Environment:

- **CraftDaemon Version** (from `package.json` or startup log `CraftDaemon vX.X.X`): 
- **Node.js Version** (`node --version`): 
- **Linux Distribution & systemd Version** (`lsb_release -d` / `systemctl --version`): 
- **Minecraft Server Type** (Paper / Vanilla / Spigot / Fabric / Forge / Other): 

## Affected Area:

<!-- Check all that apply -->
- [ ] `/start` / `/stop` / `/restart`
- [ ] `/status`
- [ ] `/logs` (live streaming)
- [ ] `/exec` (remote command execution)
- [ ] `/address`
- [ ] `/checkupdate`
- [ ] `/ping`
- [ ] RCON connection / reconnect
- [ ] Auto-shutdown
- [ ] RBAC / permissions
- [ ] Slash command registration
- [ ] Startup / bot crash
- [ ] Other

## What Happened?:

<!-- Describe the bug clearly. What did you do, what did you expect, and what actually happened? -->



## Steps to Reproduce:

1. 
2. 
3. 

## Relevant Logs:

<!-- Paste logs from `journalctl -u craftdaemon -n 100 --no-pager` or set LOG_LEVEL=DEBUG in your .env and reproduce the issue. Redact any sensitive values (tokens, passwords) before pasting. -->

```
paste logs here
```

## Relevant Configuration (sanitized):

<!-- Share any relevant .env variables or permission-config.js excerpts. NEVER share your bot TOKEN or RCON password. -->

```
paste config here
```

## Additional Context:

<!-- Anything else that might help - Discord.js errors, network setup, fresh install vs upgrade, etc. -->
