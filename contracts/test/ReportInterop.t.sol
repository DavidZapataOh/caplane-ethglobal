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

  /// @dev The arm this plan can finish end to end: a settled advance releases its lien, with
  ///      bytes the TypeScript encoder produced and the contract that will receive them decoding.
  function test_Registry_ReleasesFromTheEncodersOwnBytes() public {
    _send(_bytesFrom(".encoded"));
    assertEq(registry.statusOf(GOLDEN_LIEN), 1, "active before");

    vm.expectEmit(true, false, false, true);
    emit ICaplaneRegistry.LienReleased(GOLDEN_LIEN);
    _send(_bytesFrom(".releaseEncoded"));

    assertEq(registry.statusOf(GOLDEN_LIEN), 2, "released");
  }

  /// @dev The metadata is built FIRST: constructing it is an external call, and an external call
  ///      consumes an armed `expectRevert`. The fixture's own comment warns about exactly this.
  function test_Registry_RefusesADefaultBeforeExpiry() public {
    _send(_bytesFrom(".encoded"));

    bytes memory m = _metadata();
    bytes memory report = _bytesFrom(".defaultEncoded");
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.LienNotActive.selector, GOLDEN_LIEN));
    vm.prank(address(forwarder));
    registry.onReport(m, report);
  }

  /// @dev The default arm cannot be demonstrated end to end: no invoice in the corpus expires
  ///      before the deadline, and nothing on chain fires when one does. What CAN be proven is
  ///      that the clock is the only thing standing between here and there.
  function test_Registry_AcceptsADefaultAtExpiry() public {
    _send(_bytesFrom(".encoded"));
    vm.warp(GOLDEN_EXPIRES);

    vm.expectEmit(true, false, false, true);
    emit ICaplaneRegistry.LienDefaulted(GOLDEN_LIEN);
    _send(_bytesFrom(".defaultEncoded"));

    assertEq(registry.statusOf(GOLDEN_LIEN), 3, "defaulted");
  }

  /// @dev The reject arm needs its own nonce: the registry marks a nonce used before it looks at
  ///      the kind, so reusing the record's body reverts as a replay instead of rejecting.
  function test_Registry_RejectsWithTheReasonTheEncoderChose() public {
    vm.expectEmit(true, false, false, true);
    emit ICaplaneRegistry.SubmissionRejected(SUBMISSION_1, 6);
    _send(_bytesFrom(".rejectEncoded"));
  }
}
