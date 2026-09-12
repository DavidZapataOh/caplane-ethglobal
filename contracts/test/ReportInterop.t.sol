// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ICaplaneRegistry} from "../src/interfaces/ICaplaneRegistry.sol";
import {RegistryFixture} from "./support/RegistryFixture.sol";

/// @dev The two report tests that already exist encode in Solidity and decode in Solidity. They
///      cannot catch a TypeScript encoder that drifts from the schema — that produces bytes the
///      registry decodes into a DIFFERENT lien, with no error anywhere. These send the bytes the
///      TypeScript encoder is checked against, through the forwarder, into the real contract.
contract ReportInteropTest is RegistryFixture {
  bytes32 internal constant GOLDEN_LIEN = bytes32(uint256(0x11E));
  uint64 internal constant GOLDEN_EXPIRES = 1_799_000_000;

  function _bytesFrom(
    string memory key
  ) internal view returns (bytes memory) {
    return vm.parseJsonBytes(vm.readFile("../claim/fixtures/report.json"), key);
  }

  function test_Registry_RecordsFromTheEncodersOwnBytes() public {
    vm.expectEmit(true, true, false, true);
    emit ICaplaneRegistry.LienRecorded(GOLDEN_LIEN, BORROWER, GOLDEN_EXPIRES);
    _send(_bytesFrom(".encoded"));

    ICaplaneRegistry.Lien memory lien = registry.lienOf(GOLDEN_LIEN);
    assertEq(lien.borrower, BORROWER, "borrower");
    assertEq(lien.expiresAt, GOLDEN_EXPIRES, "expiry");
    assertEq(lien.advanceUsdc6, 250_000_000, "advance");
    assertEq(lien.rateBps, 150, "rate");
    assertEq(uint8(lien.status), 1, "active");
  }

  /// @dev The reject arm needs its own nonce: the registry marks a nonce used before it looks at
  ///      the kind, so reusing the record's body reverts as a replay instead of rejecting.
  function test_Registry_RejectsWithTheReasonTheEncoderChose() public {
    vm.expectEmit(true, false, false, true);
    emit ICaplaneRegistry.SubmissionRejected(SUBMISSION_1, 6);
    _send(_bytesFrom(".rejectEncoded"));
  }
}
