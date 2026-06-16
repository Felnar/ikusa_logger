# BDO Combat Logger — experimental fork

> ⚠️ **Experimental fork of [Arkantik/ikusa_logger](https://github.com/Arkantik/ikusa_logger).**
> For the actively supported application, use the **upstream repository**.
> This fork exists only to test changes and may be unstable.
>
> 🐧 **Linux users:** see the [`linux`](https://github.com/Felnar/ikusa_logger/tree/linux) branch.

A tool for Black Desert Online that captures and logs combat messages during PvP
(Node Wars, Sieges, War of the Roses).

## What's different in this fork

- **More robust kill-offset auto-detection.** Candidate offsets are ranked by
  toggle *consistency* (`kills + deaths` coverage) instead of raw death count, so
  detection no longer misfires during high-K/D sessions.

## Install (Windows, build from source)

There's no prebuilt installer for this branch.

**Prerequisites:** [Node.js 20+](https://nodejs.org/en/download/),
[Python 3](https://www.python.org/downloads/) (tick **"Add Python to PATH"**),
[Npcap 1.7.8+](https://npcap.com/dist/).

```bash
git clone -b experimental/killoffset-coverage-detection https://github.com/Felnar/ikusa_logger.git
cd ikusa_logger
build.bat
```

Then run:

```
dist\bdo-combat-logger\bdo-combat-logger-win_x64.exe
```

If Windows SmartScreen warns about an unrecognized app, click **More info → Run anyway**.
