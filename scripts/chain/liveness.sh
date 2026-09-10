#!/usr/bin/env bash
# Proves the Arc endpoint is alive and behaves as the frozen constants assume.
set -euo pipefail
: "${ARC_TESTNET_RPC_URL:?ARC_TESTNET_RPC_URL is required}"

rpc () {
  curl -sS --fail-with-body -X POST "$ARC_TESTNET_RPC_URL" \
    -H 'Content-Type: application/json' -d "$1"
}

echo "chainId:  $(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}')"
echo "client:   $(rpc '{"jsonrpc":"2.0","id":1,"method":"web3_clientVersion","params":[]}')"
echo "block:    $(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}')"
echo "gasPrice: $(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_gasPrice","params":[]}')"
echo "batch:    $(rpc '[{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]},
                        {"jsonrpc":"2.0","id":2,"method":"eth_blockNumber","params":[]},
                        {"jsonrpc":"2.0","id":3,"method":"eth_gasPrice","params":[]}]')"
