// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Exists so the contracts CI job is not vacuously green before 02/01 lands.
contract Placeholder {
  function version() external pure returns (uint256) {
    return 1;
  }
}
