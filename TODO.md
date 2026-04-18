# Task: Add cooldown/lock to state-changing commands (/start, /stop, /restart)

**TASK COMPLETED** ✅

Added configurable cooldown:
- New .env var: `COMMAND_COOLDOWN_MS=10000` (2-60s range, default 10s)
- Logs in startup config.

Original steps:
- [x] Step 1: Add global lock variables
- [x] Step 2: Implement acquireLock/releaseLock
- [x] Step 3-5: Integrate into commands
- [x] Step 6: Release on success/error
- [x] Step 7: Logical verification
- [x] Step 8: Finalized

