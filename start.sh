#!/bin/bash
# Run from the script's own directory so it works regardless of CWD.
cd "$(dirname "$0")/dist/bdo-combat-logger/" || {
    echo "[ERROR]: Missing dist/bdo-combat-logger/. Did you run ./build.sh first?"
    exit 1
}

# Work around webkit2gtk rendering issues (e.g. a blank window) on some
# GPUs/drivers by disabling hardware compositing.
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_PARTIALS=1

./bdo-combat-logger-linux_x64
