#!/bin/bash
# Resolve the real path of this script (follows symlink chains)
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"

# Packaged app: cli.js is next to this script in Contents/Resources/
# Dev mode: cli.js is in out/main/ relative to the project root
if [ -f "$DIR/cli.js" ]; then
  CLI="$DIR/cli.js"
else
  CLI="$DIR/../out/main/cli.js"
fi
# Use the grandparent PID as the stable session anchor.
# Claude Code spawns a fresh subshell ($PPID) per bash command,
# but its own PID (the grandparent) stays constant across the conversation.
if [ -z "$TELESCOPE_PARENT_PID" ]; then
  TELESCOPE_PARENT_PID=$(ps -o ppid= -p $PPID 2>/dev/null | tr -d ' ')
  TELESCOPE_PARENT_PID="${TELESCOPE_PARENT_PID:-$PPID}"
fi
export TELESCOPE_PARENT_PID
exec node "$CLI" "$@"
