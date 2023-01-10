# Sandbox

## Description

Sandbox is a docker-compose file that aims to emulate the whole RPCh stack locally on your machine.

This includes:

- running local RPC node
- running local HOPRd node which uses the RPC node (acts as entry node)
- running intermediary nodes
- running HOPRd and RPCh exit nodes
- running RPCh discovery platform
- running RPCh funding service

### Getting started

1. Install
   - nodejs `v16`
   - latest version of `docker` and `docker-compose`
2. Clone this repository
3. Download dependencies with `yarn`
4. Build everything with `yarn build`
5. Navigate to `devkit/sandbox`
6. Start sandbox with `yarn start`
7. Stop sandbox with `yarn stop`

### Using it with Block Wallet

You can try out the RPCh sandbox by setting up our forked version of Block Wallet.

1. Install `git` and `make` on your machine
2. Git clone [Rpc-h/extension-block-wallet](https://github.com/Rpc-h/extension-block-wallet)
3. Checkout to branch `implement-ethers-adaptor`
4. Follow the setup instructions in the [README](https://github.com/Rpc-h/extension-block-wallet/tree/implement-ethers-adaptor#getting-started)
5. Add extension into your browser
