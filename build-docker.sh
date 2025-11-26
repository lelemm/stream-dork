#!/bin/bash

set -euo pipefail

echo "🔃 Building renderer assets..."
npm run build

echo "🐳 Building Docker image..."
docker build \
  --no-cache \
  --progress=plain \
  --build-arg USER_ID=$(id -u) \
  --build-arg GROUP_ID=$(id -g) \
  -t fake-stream-deck .

echo "🗃️ Preparing cache directories..."
mkdir -p ~/.cache/electron
mkdir -p ~/.cache/electron-builder
mkdir -p dist-electron

echo "🚀 Running Docker container to produce Windows build..."
docker run --rm -ti \
  --env ELECTRON_CACHE="/tmp/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/tmp/.cache/electron-builder" \
  -v ${PWD}/dist-electron:/project/dist-electron \
  -v ~/.cache/electron:/tmp/.cache/electron \
  -v ~/.cache/electron-builder:/tmp/.cache/electron-builder \
  --name fake-stream-deck-builder \
  fake-stream-deck

echo "✅ Docker build complete. Artifacts available in dist-electron/"

