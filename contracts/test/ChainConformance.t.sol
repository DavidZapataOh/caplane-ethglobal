// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

interface IERC20Metadata {
  function decimals() external view returns (uint8);
  function symbol() external view returns (string memory);
}

/// @dev Fork test. Pins the frozen chain constants to the live network so a change
///      upstream turns CI red instead of surfacing during the final deploy.
contract ChainConformanceTest is Test {
  address constant USDC = 0x3600000000000000000000000000000000000000;
  address constant FORWARDER = 0x76c9cf548b4179F8901cda1f8623568b58215E62;

  function test_ChainId_IsArcTestnet() public view {
    assertEq(block.chainid, 5_042_002);
  }

  function test_Usdc_HasSixDecimals() public view {
    assertEq(IERC20Metadata(USDC).decimals(), 6);
  }

  function test_Usdc_IsTheUsdcToken() public view {
    assertEq(IERC20Metadata(USDC).symbol(), "USDC");
  }

  function test_Forwarder_IsDeployed() public view {
    assertGt(FORWARDER.code.length, 0);
  }

  function test_BaseFee_SitsOnTheTwentyGweiFloor() public view {
    assertGe(block.basefee, 20 gwei);
  }
}
