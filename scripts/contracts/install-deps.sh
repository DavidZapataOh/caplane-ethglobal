#!/usr/bin/env bash
# Solidity dependencies live under contracts/lib, which is gitignored, so a fresh checkout has
# none of them and every compile fails with "Source not found". They are pinned by tag rather
# than installed by a resolver: the version a contract compiles against is part of its build.
#
# forge-std and OpenZeppelin are imported. The chainlink remapping exists for reading upstream
# source, not for compilation, so nothing here fetches it.
set -euo pipefail

FORGE_STD_TAG=v1.16.2
OZ_TAG=v5.7.0
LIB="$(cd "$(dirname "$0")/../.." && pwd)/contracts/lib"

mkdir -p "$LIB"
if [ ! -d "$LIB/forge-std/src" ]; then
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$FORGE_STD_TAG" \
    https://github.com/foundry-rs/forge-std "$LIB/forge-std"
  rm -rf "$LIB/forge-std/.git"
fi
echo "forge-std $FORGE_STD_TAG at $LIB/forge-std"

# The guard tests the contents, not the directory: an interrupted clone leaves the folder behind
# and a directory-only guard would then skip the install forever. Same shape as the forge-std one.
if [ ! -d "$LIB/openzeppelin-contracts/contracts" ]; then
  git -c advice.detachedHead=false clone --depth 1 --quiet --branch "$OZ_TAG" \
    https://github.com/OpenZeppelin/openzeppelin-contracts "$LIB/openzeppelin-contracts"
  rm -rf "$LIB/openzeppelin-contracts/.git"
fi
echo "openzeppelin-contracts $OZ_TAG at $LIB/openzeppelin-contracts"
