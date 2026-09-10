// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ICaplaneRegistry} from "../../src/interfaces/ICaplaneRegistry.sol";

/// @dev The exact ERC-165 shape a Keystone receiver must expose. `02/01` copies this verbatim.
///      Kept `pure` and cheap: the checker gives each probe a 30,000 gas stipend and runs three.
contract MinimalReceiver {
  function supportsInterface(
    bytes4 interfaceId
  ) public pure returns (bool) {
    return interfaceId == ICaplaneRegistry.onReport.selector // 0x805f2132
      || interfaceId == bytes4(0x01ffc9a7);
  }
}
