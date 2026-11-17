#!/usr/bin/env bash
# OtoDita — inicia a aplicação em http://localhost:8765 (necessário para o microfone)
cd "$(dirname "$0")"
PORT="${PORT:-8765}"
URL="http://localhost:$PORT/"
echo "OtoDita a correr em $URL  (Ctrl+C para terminar)"
( sleep 1; command -v xdg-open >/dev/null && xdg-open "$URL" || command -v open >/dev/null && open "$URL" ) >/dev/null 2>&1 &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
