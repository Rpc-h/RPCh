#!/bin/bash

# prevent sourcing of this script, only allow execution
$(return >/dev/null 2>&1)
test "$?" -eq "0" && { echo "This script should only be executed." >&2; exit 1; }

# path to this file
DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)
# path to sandbox files
DIR_SANDBOX=$(realpath $DIR/../../sandbox/src)

# load sandbox's start & stop functions
source $DIR_SANDBOX/common.sh

# If there's a fatal error or users Ctrl+C it will tear down setup
trap 'stop' SIGINT SIGKILL SIGTERM ERR EXIT

# start sandbox
start

# catch error if command fails
set -Eeuo pipefail
# Run tests with env variables
npx jest --ci
# stop catching
set +Eeuo pipefail

# After tests exit tear down setup
stop