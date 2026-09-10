// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Placeholder} from "../src/Placeholder.sol";
import {Test} from "forge-std/Test.sol";

contract PlaceholderTest is Test {
  function test_Version_ReturnsOne() public {
    Placeholder p = new Placeholder();
    assertEq(p.version(), 1);
  }
}
