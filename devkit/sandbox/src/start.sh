#!/usr/bin/env bash

# prevent sourcing of this script, only allow execution
$(return >/dev/null 2>&1)
test "$?" -eq "0" && { echo "This script should only be executed." >&2; exit 1; }

# path to this file
DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)

# load sandbox's start & stop functions
source $DIR/common.sh

# If there's a fatal error
trap 'stop' SIGINT SIGKILL SIGTERM ERR

# start sandbox
start

docker ps
