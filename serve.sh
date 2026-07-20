#!/bin/sh
# 本地运行：在项目根目录启动静态服务器（禁用缓存）
cd "$(dirname "$0")"
PORT="${1:-8000}"
exec python3 serve.py "$PORT"
