#!/bin/sh
set -u

while true; do
  node server.js &
  pid=$!

  while kill -0 "$pid" 2>/dev/null; do
    node gavin-brickeconomy-bootstrap.js
    code=$?

    if [ "$code" -eq 0 ]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      break
    fi

    sleep 2
  done

  if kill -0 "$pid" 2>/dev/null; then
    continue
  fi

  wait "$pid" 2>/dev/null
  status=$?
  if [ "$status" -ne 0 ] && [ "$status" -ne 143 ]; then
    exit "$status"
  fi
done
