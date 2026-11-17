@echo off
REM OtoDita - inicia a aplicacao em http://localhost:8765 (necessario para o microfone)
cd /d "%~dp0"
set PORT=8765
echo OtoDita a correr em http://localhost:%PORT%/  (feche esta janela para terminar)
start "" "http://localhost:%PORT%/"
where py >nul 2>nul && (py -m http.server %PORT% --bind 127.0.0.1) || (python -m http.server %PORT% --bind 127.0.0.1)
pause
