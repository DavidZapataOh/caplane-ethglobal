// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";

/// @dev The cheapest thing that can be deployed. It lives here rather than in `src/` because it
///      is not part of the system — it exists only so the unknowns of deployment cost two
///      thousandths of a dollar to settle instead of the whole deployment.
contract Probe {
  function version() external pure returns (uint256) {
    return 1;
  }
}

/// @dev Three things cannot be settled without a real broadcast: whether the chained verify
///      reaches this explorer, what a populated receipt actually contains, and whether the
///      verifier recompiles to the same bytecode under this chain's semantics.
///
///      It does NOT settle a fourth: `Probe` takes no constructor arguments, so this rehearses
///      nothing about constructor-argument encoding — which is the likeliest thing to break on
///      the four real contracts, where there are between two and four arguments each. Saying so
///      is better than believing it was covered.
contract DeployProbe is Script {
  function run() external {
    vm.startBroadcast(vm.envUint("DEPLOYER_KEY"));
    new Probe();
    vm.stopBroadcast();
  }
}
