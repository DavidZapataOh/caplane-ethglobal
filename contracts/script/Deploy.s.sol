// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplaneEscrow} from "../src/CaplaneEscrow.sol";
import {CaplaneInbox} from "../src/CaplaneInbox.sol";
import {CaplanePool} from "../src/CaplanePool.sol";
import {CaplaneRegistry} from "../src/CaplaneRegistry.sol";
import {ICaplaneRegistry} from "../src/interfaces/ICaplaneRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script} from "forge-std/Script.sol";

/// @notice Deploys the four contracts and leaves the address book to the broadcast artefact.
/// @dev Every value comes from the environment: no address is written into this file, so pointing
///      it at another network is a change of variables rather than a change of code. The address
///      book is written from `run-latest.json` afterwards, not from here — two writers for one
///      file is how they end up disagreeing, and the artefact exists even if this script dies
///      halfway.
contract Deploy is Script {
  function run() external {
    address forwarder = vm.envAddress("CHAIN_FORWARDER");
    address workflowOwner = vm.envAddress("WORKFLOW_OWNER");
    uint64 chainSelector = uint64(vm.envUint("CHAIN_SELECTOR"));
    IERC20 usdc = IERC20(vm.envAddress("CHAIN_USDC"));

    // bytes10 of the first ten HEX CHARACTERS of sha256(name), taken as ASCII bytes.
    // `vm.toString(bytes32)` prefixes "0x", so taking bytes10 of it directly would yield "0x"
    // plus EIGHT hex characters — a different name, accepted in silence, immutable for ever.
    // The prefix is stripped, and the result is checked against what the environment carries so
    // two independent derivations must agree before anything is broadcast. This is the only
    // defence against a mistake the chain accepts without complaint and no setter can undo.
    bytes10 workflowName =
      bytes10(bytes(vm.replace(vm.toString(sha256(bytes(vm.envString("WORKFLOW_NAME")))), "0x", "")));
    // `vm.envBytes10` does not exist. Reading it as dynamic bytes means the width has to be
    // asserted too: `bytes10` of a short value pads with zeros rather than failing, which would
    // let a truncated declaration agree with a truncated derivation.
    bytes memory declared = vm.envBytes("WORKFLOW_NAME_BYTES10");
    require(declared.length == 10, "WORKFLOW_NAME_BYTES10 is not ten bytes");
    // casting to 'bytes10' is safe because the line above already asserted the width is exactly
    // ten — the truncation the linter warns about is what that check exists to rule out.
    // forge-lint: disable-next-line(unsafe-typecast)
    require(workflowName == bytes10(declared), "workflow name mismatch");

    vm.startBroadcast(vm.envUint("DEPLOYER_KEY"));

    new CaplaneInbox();
    CaplaneRegistry registry = new CaplaneRegistry(forwarder, workflowOwner, workflowName, chainSelector);
    CaplanePool pool = new CaplanePool(usdc, ICaplaneRegistry(address(registry)));
    new CaplaneEscrow(usdc, ICaplaneRegistry(address(registry)), pool);

    vm.stopBroadcast();
  }
}
