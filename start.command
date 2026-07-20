#!/bin/bash
# Milankovitch Cycles — 双击启动脚本 (macOS)
# 在 Finder 中双击本文件：若已有服务在运行则先关闭，再重新启动，并自动打开浏览器。
cd "$(dirname "$0")"
PORT=8000

PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "Found running server (PID: $PIDS), stopping it..."
  kill $PIDS 2>/dev/null
  sleep 1
fi

echo "Starting server: http://localhost:$PORT"
python3 serve.py "$PORT" >/dev/null 2>&1 &
sleep 1
# URL 加时间戳参数，避免浏览器复用旧标签页而不刷新（静态服务器会忽略该参数）
open "http://localhost:$PORT/?t=$(date +%s)"

echo ""
echo "Server is running at http://localhost:$PORT"
echo "Close this window to stop the server."
wait
