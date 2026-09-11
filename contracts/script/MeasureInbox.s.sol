// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplaneInbox} from "../src/CaplaneInbox.sol";
import {Script} from "forge-std/Script.sol";

/// @dev Two submissions at the two sizes that matter: the envelope a real claim produces, and
///      the cap. Their receipts carry the only honest cost figure — execution gas omits the
///      intrinsic charge, the calldata and the EIP-7623 floor, which is most of it.
contract MeasureInbox is Script {
  function _envelope(
    uint256 length
  ) private pure returns (bytes memory e) {
    e = new bytes(length);
    for (uint256 i; i < length; ++i) {
      // casting to 'uint8' is safe because `i % 251 + 1` is in [1, 251], which is why 251 is
      // the modulus: it keeps every envelope byte non-zero, so the calldata floor binds the
      // way a real ciphertext makes it bind.
      // forge-lint: disable-next-line(unsafe-typecast)
      e[i] = bytes1(uint8(i % 251 + 1));
    }
  }

  function run() external {
    uint256 key = vm.envUint("MEASURE_KEY");
    address sender = vm.addr(key);

    vm.startBroadcast(key);
    CaplaneInbox inbox = new CaplaneInbox();
    for (uint256 i; i < 2; ++i) {
      bytes memory envelope = _envelope(i == 0 ? 275 : 4096);
      inbox.submit(keccak256(abi.encodePacked(sender, envelope)), envelope);
    }
    vm.stopBroadcast();
  }
}
