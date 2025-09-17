@echo off
:: Откроет консоль в текущей папке и запустит скрипт с логом
chcp 65001 >nul
pushd "%~dp0"
cmd /k "%~dp0audio_to_video_auto_verbose.bat"
