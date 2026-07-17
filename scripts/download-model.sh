#!/bin/bash
# Download whisper.cpp model for K.I.R.A.
# Usage: ./scripts/download-model.sh [model-size]
# Available sizes: tiny, base, small, medium, large
# Default: small.en (recommended balance of speed + accuracy)

set -e

MODEL_SIZE="${1:-small.en}"
MODEL_DIR="models"
MODEL_FILE="ggml-${MODEL_SIZE}.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILE}"

echo "╔══════════════════════════════════════╗"
echo "║  K.I.R.A. — Whisper Model Download   ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Model: ${MODEL_SIZE}"
echo "URL:   ${MODEL_URL}"
echo ""

mkdir -p "${MODEL_DIR}"

if [ -f "${MODEL_DIR}/${MODEL_FILE}" ]; then
  echo "✓ Model already exists at ${MODEL_DIR}/${MODEL_FILE}"
  echo "  Delete it first if you want to re-download."
  exit 0
fi

echo "Downloading ${MODEL_FILE}..."
echo "This may take a few minutes depending on your connection."
echo ""

if command -v curl &> /dev/null; then
  curl -L --progress-bar -o "${MODEL_DIR}/${MODEL_FILE}" "${MODEL_URL}"
elif command -v wget &> /dev/null; then
  wget --progress=bar:force -O "${MODEL_DIR}/${MODEL_FILE}" "${MODEL_URL}"
else
  echo "Error: Neither curl nor wget found. Install one of them."
  exit 1
fi

echo ""
echo "✓ Downloaded to ${MODEL_DIR}/${MODEL_FILE}"
echo ""

# Verify file size (small.en is ~488MB)
FILE_SIZE=$(stat -c%s "${MODEL_DIR}/${MODEL_FILE}" 2>/dev/null || stat -f%z "${MODEL_DIR}/${MODEL_FILE}" 2>/dev/null)
FILE_SIZE_MB=$((FILE_SIZE / 1024 / 1024))
echo "  Size: ${FILE_SIZE_MB} MB"
echo ""
echo "Model sizes for reference:"
echo "  tiny.en   ~  75 MB  (fastest, lowest accuracy)"
echo "  base.en   ~ 142 MB  (fast, moderate accuracy)"
echo "  small.en  ~ 488 MB  (balanced — recommended)"
echo "  medium.en ~ 1.5 GB  (slower, high accuracy)"
echo "  large     ~ 3.1 GB  (slowest, highest accuracy)"
echo ""
echo "✓ K.I.R.A. is ready to transcribe!"
