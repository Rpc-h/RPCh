#!/bin/bash

# path to this file
DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)

# stop sandbox
stop() {
    docker-compose -f $DIR/nodes-docker-compose.yml -p sandbox-nodes down;
    docker-compose -f $DIR/central-docker-compose.yml -p sandbox-central down;
    exit;
}

# start sandbox
start() {
    echo "Starting 'nodes-docker-compose' and waiting for funding & open channels"

    #  Run docker compose as daemon
    rm -f $DIR/logs;
    docker compose -f $DIR/nodes-docker-compose.yml -p sandbox-nodes \
        up -d --remove-orphans --build --force-recreate

    # Extract HOPRD_API_TOKEN from env file
    source $DIR/.env

    logs1=""
    logs2=""
    logs3=""
    logs4=""
    logs5=""
    logs_pluto=""
    logs_error=""
    segmentation_error=""
    pluto=false
    sleep 10

    until [[ $logs1 =~ "Listening for incoming messages from HOPRd" ]]; do
        docker logs sandbox-nodes-exit-1-1 &> $DIR/logs
        logs1=$(cat $DIR/logs)
        sleep 1
    done
    echo "Node 1 running"

    until [[ $logs2 =~ "Listening for incoming messages from HOPRd" ]]; do
        docker logs sandbox-nodes-exit-2-1 &> $DIR/logs
        logs2=$(cat $DIR/logs)
        sleep 1
    done
    echo "Node 2 running"

    until [[ $logs3 =~ "Listening for incoming messages from HOPRd" ]]; do
        docker logs sandbox-nodes-exit-3-1 &> $DIR/logs
        logs3=$(cat $DIR/logs)
        sleep 1
    done
    echo "Node 3 running"

    until [[ $logs4 =~ "Listening for incoming messages from HOPRd" ]]; do
        docker logs sandbox-nodes-exit-4-1 &> $DIR/logs
        logs4=$(cat $DIR/logs)
        sleep 1
    done
    echo "Node 4 running"

    until [[ $logs5 =~ "Listening for incoming messages from HOPRd" ]]; do
        docker logs sandbox-nodes-exit-5-1 &> $DIR/logs
        logs5=$(cat $DIR/logs)
        sleep 1
    done
    echo "Node 5 running"
    echo "All nodes ready!"

    echo "Waiting for node to find each other and channels to open"
    until [[ $pluto == true ]]; do
        docker logs sandbox-nodes-pluto-1 &> $DIR/logs
        logs_pluto=$(cat $DIR/logs | grep "Terminating this script will clean up the running local cluster" | head -1)
        logs_error=$(cat $DIR/logs | grep "Cleaning up processes" | head -1)
        segmentation_error=$(cat $DIR/logs | grep "Segmentation fault" | head -1)
        # Check for a segmentation fault or if the retries are over
        if [[ ! -z "$logs_error" || ! -z "$segmentation_error" ]]; then
            echo "Unrecoverable error"
            echo "Exiting..."
            stop
            exit
        fi

        [[ ! -z "$logs_pluto" ]] && pluto=true
    done

    echo "Done 'nodes-docker-compose'"

    # extract public keys
    exit_node_pub_key_1=$(echo "$logs1" | grep "Running exit node with public key" | awk '{print $9}')
    exit_node_pub_key_2=$(echo "$logs2" | grep "Running exit node with public key" | awk '{print $9}')
    exit_node_pub_key_3=$(echo "$logs3" | grep "Running exit node with public key" | awk '{print $9}')
    exit_node_pub_key_4=$(echo "$logs4" | grep "Running exit node with public key" | awk '{print $9}')
    exit_node_pub_key_5=$(echo "$logs5" | grep "Running exit node with public key" | awk '{print $9}')

    echo "Extracted public keys"
    echo "node1=$exit_node_pub_key_1"
    echo "node2=$exit_node_pub_key_2"
    echo "node3=$exit_node_pub_key_3"
    echo "node4=$exit_node_pub_key_4"
    echo "node5=$exit_node_pub_key_5"

    # fund funding-service wallet
    echo "Funding funding-service wallet"
    hoprTokenAddress=$( \
        NODE_ENV=production FUNDING_HOPRD_API_TOKEN=${HOPRD_API_TOKEN} \
        npx ts-node $DIR/fund-funding-service.ts
    )
    echo "Found hoprTokenAddress: $hoprTokenAddress"

    echo "Starting 'central-docker-compose'"
    SMART_CONTRACT_ADDRESS="$hoprTokenAddress" \
        docker compose -f $DIR/central-docker-compose.yml -p sandbox-central \
        up -d --remove-orphans --build --force-recreate
    echo "Done 'central-docker-compose'"

    # register nodes
    echo "Registering nodes to discovery-platform"
    hoprTokenAddress=$( \
        NODE_ENV=production HOPRD_API_TOKEN=${HOPRD_API_TOKEN} \
        EXIT_NODE_PUB_KEY_1=${exit_node_pub_key_1} \
        EXIT_NODE_PUB_KEY_2=${exit_node_pub_key_2} \
        EXIT_NODE_PUB_KEY_3=${exit_node_pub_key_3} \
        EXIT_NODE_PUB_KEY_4=${exit_node_pub_key_4} \
        EXIT_NODE_PUB_KEY_5=${exit_node_pub_key_5} \
        npx ts-node $DIR/register-nodes.ts
    )
    echo "Registered nodes to discovery-platform"

    echo "Sandbox is ready!"
}
