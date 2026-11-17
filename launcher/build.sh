#!/usr/bin/env bash
# Compila o OtoDita.exe (Windows 64-bit) com a aplicação web embutida.
# Requisitos: Go 1.22+ e go-winres (go install github.com/tc-hib/go-winres@v0.3.3)
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..
VERSION="${VERSION:-$(date +%Y.%m.%d)}"

rm -rf web && mkdir -p web
cp -r "$ROOT/index.html" "$ROOT/manifest.webmanifest" "$ROOT/css" "$ROOT/js" "$ROOT/assets" web/

# ícone e metadados do executável (gera rsrc_windows_*.syso)
"${GOWINRES:-go-winres}" make --product-version "$VERSION.0" --file-version "$VERSION.0" >/dev/null

mkdir -p "$ROOT/dist"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath \
  -ldflags "-s -w -X main.version=$VERSION" -o "$ROOT/dist/OtoDita.exe" .
echo "Criado: dist/OtoDita.exe ($(du -h "$ROOT/dist/OtoDita.exe" | cut -f1))"
