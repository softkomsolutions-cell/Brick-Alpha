#!/bin/sh
set -u

while true; do
  node server.js &
  pid=$!
  restart_requested=0

  while kill -0 "$pid" 2>/dev/null; do
    node gavin-brickeconomy-bootstrap.js
    code=$?

    if [ "$code" -eq 0 ]; then
      restart_requested=1
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      break
    fi

    sleep 2
  done

  if [ "$restart_requested" -eq 1 ]; then
    continue
  fi

  wait "$pid" 2>/dev/null
  status=$?
  exit "$status"
done
