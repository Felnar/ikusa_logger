# BDO Combat Logger — Linux (experimental fork)

> ⚠️ **Experimental fork of [Arkantik/ikusa_logger](https://github.com/Arkantik/ikusa_logger).**
> For the actively supported (Windows) application, use the **upstream repository**.
> This fork exists only to test changes and may be unstable.

A tool for Black Desert Online that captures and logs combat messages during PvP
(Node Wars, Sieges, War of the Roses).

> This is the **Linux** branch: the same React/Neutralino app as the rest of this
> fork, with the Windows-only installer, Npcap and `.bat` tooling removed and a
> native Linux build/run path (`build.sh` / `start.sh`, using `libpcap` + `setcap`
> instead of Npcap). It also includes this fork's kill-offset detection change.

## Prerequisites

Install via your distro's package manager:

- **Node.js 20+**
- **Python 3** (with `venv`)
- **libpcap** development headers — for packet capture (e.g. `libpcap-dev` on
  Debian/Ubuntu, `libpcap-devel` on Fedora)
- **libcap** — provides `setcap` (e.g. `libcap2-bin` on Debian/Ubuntu)
- **webkit2gtk** — required by Neutralino's window (e.g. `webkit2gtk4.1` /
  `webkit2gtk3`)

## Build

```bash
./build.sh
```

This creates a Python virtual environment, installs `scapy`/`pyinstaller`, builds
the logger and the Neutralino app, and grants the capture binaries the
`cap_net_raw` capability via `setcap` (you will be prompted for `sudo`). Output
lands in `dist/bdo-combat-logger/`.

## Run

```bash
./start.sh
```

If the window fails to render, start it in browser mode:

```bash
cd dist/bdo-combat-logger && ./bdo-combat-logger-linux_x64 --mode=browser
```

## Usage

1. Click **Record** to start capturing.
2. When done, make sure the player names are ordered correctly:
   `Family-Name-1 killed / died to Family-Name-2 from Enemy-Guild`.
3. **Save** the logs to a `.log` file, or **Upload** them to the visualization
   site. You can reopen a saved `.log` later to adjust names.

## Notes

- The offset values (kill flag, player/guild names, identifier) are auto-detected
  from captured logs, so they re-derive themselves after a Black Desert
  maintenance instead of needing manual reconfiguration.
- Capture requires the `cap_net_raw` capability set by `build.sh`; if you move the
  binaries, re-run `setcap cap_net_raw=eip` on them.
