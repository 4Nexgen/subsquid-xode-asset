#!/bin/bash

# Define the command to run
CMD="node --max-old-space-size=16384 -r dotenv/config lib/main.js"

# Specify a log file to capture output
LOG_FILE="process.log"

# Time in seconds to consider the process as stuck
TIMEOUT=300

# Time in seconds to check for issues
CHECK_INTERVAL=30

# Function to check if the process is running
is_running() {
  pgrep -f "$CMD" > /dev/null
}

# Function to restart the process
restart_process() {
  echo "Starting process..."
  $CMD > "$LOG_FILE" 2>&1 &
  PID=$!
  echo "Process started with PID: $PID"
}

# Function to check if the logs are stuck
check_logs_stuck() {
  last_mod_time=$(stat -c %Y "$LOG_FILE")

  sleep "$CHECK_INTERVAL"

  new_mod_time=$(stat -c %Y "$LOG_FILE")

  if [ "$last_mod_time" -eq "$new_mod_time" ]; then
    echo "Logs are stuck. Restarting..."
    return 1
  fi

  return 0
}

# Function to check for connection failures in logs
check_connection_failure() {
  if grep -qE "connection failure|RpcConnectionError" "$LOG_FILE"; then
    echo "Connection failure detected. Restarting..."
    return 1
  fi

  return 0
}

# Start the process initially
restart_process

# Keep monitoring the process
while true; do
  sleep "$CHECK_INTERVAL"

  if ! is_running; then
    echo "Process stopped. Restarting..."
    restart_process
  else
    check_logs_stuck || { kill "$PID"; restart_process; }
    check_connection_failure || { kill "$PID"; restart_process; }
  fi
done
