#!/bin/sh
set -eu
if [ "$(uname -s)" != Darwin ]; then
  echo 'The native notch helper requires macOS (AppKit and SwiftUI).' >&2
  exit 1
fi
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SOURCE="$ROOT/native/sonora-island/IslandHelper.swift"
OUTPUT="$ROOT/native/sonora-island/sonora-island-helper"
if [ ! -f "$SOURCE" ]; then echo "Missing Swift source: $SOURCE" >&2; exit 1; fi
swiftc -parse-as-library -O "$SOURCE" -framework AppKit -framework SwiftUI -o "$OUTPUT"
"$OUTPUT" --self-test
printf 'Verified native island helper: %s\n' "$OUTPUT"
