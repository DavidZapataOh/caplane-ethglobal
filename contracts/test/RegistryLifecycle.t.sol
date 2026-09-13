// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ICaplaneRegistry} from "../src/interfaces/ICaplaneRegistry.sol";
import {RegistryFixture} from "./support/RegistryFixture.sol";
import {Reports} from "./support/Reports.sol";

/// @dev The two immutable defects this contract was redeployed to fix. Both are invisible until a
///      lien has been through its life, which is why neither showed up in the original suite.
contract RegistryLifecycleTest is RegistryFixture {
  function _commitments(
    bytes32 seed
  ) internal pure returns (bytes32[] memory c) {
    c = new bytes32[](7);
    for (uint256 i; i < 7; ++i) {
      c[i] = keccak256(abi.encodePacked(seed, i));
    }
  }

  /// @dev A paid invoice must be financeable again. The gate was `status != 0`, so a released lien
  ///      kept its key for ever — and since the key is deterministic over the claim, the receivable
  ///      was burned. The settlement handler exists to "close the lien so the receivable can be
  ///      financed again", and it could not.
  function test_Registry_ARereleasedLienCanBeRecordedAgain() public {
    bytes32[] memory c = _commitments("a");
    _send(Reports.body(1, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 250e6, 150, EXPIRES, c));
    assertEq(registry.statusOf(LIEN_A), 1, "active");

    _send(Reports.body(2, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 0, 0, 0, new bytes32[](0)));
    assertEq(registry.statusOf(LIEN_A), 2, "released");

    _send(Reports.body(1, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 250e6, 150, EXPIRES, c));
    assertEq(registry.statusOf(LIEN_A), 1, "financeable again");
  }

  /// @dev Default is terminal and stays terminal. Releasing frees the receivable; defaulting does
  ///      not, and widening the gate must not have widened that too.
  function test_Registry_ADefaultedLienStaysClosed() public {
    bytes32[] memory c = _commitments("b");
    _send(Reports.body(1, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 250e6, 150, EXPIRES, c));
    vm.warp(EXPIRES);
    _send(Reports.body(3, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 0, 0, 0, new bytes32[](0)));
    assertEq(registry.statusOf(LIEN_A), 3, "defaulted");

    bytes memory m = _metadata();
    bytes memory report = Reports.body(1, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 250e6, 150, EXPIRES, c);
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.AlreadyEncumbered.selector, LIEN_A));
    _sendFrom(m, report);
  }

  /// @dev An active lien is still refused, which is the whole point of the gate.
  function test_Registry_AnActiveLienIsStillRefused() public {
    bytes32[] memory c = _commitments("c");
    _send(Reports.body(1, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 250e6, 150, EXPIRES, c));

    bytes memory m = _metadata();
    bytes memory report = Reports.body(1, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 250e6, 150, EXPIRES, c);
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.AlreadyEncumbered.selector, LIEN_A));
    _sendFrom(m, report);
  }

  /// @dev Closing a lien must remove its posting-list entries. They were left behind, so the walk
  ///      `matchesOf` performs degraded monotonically for the life of the registry with no way to
  ///      reclaim it — measured at 1,467,987 gas for 200 released liens against a node call cap.
  function test_Registry_ClosingALienReclaimsItsPostings() public {
    bytes32[] memory shared = _commitments("shared");

    for (uint256 i; i < 20; ++i) {
      bytes32 id = bytes32(uint256(0x1000 + i));
      _send(Reports.body(1, SELECTOR, _next(), id, SUBMISSION_1, BORROWER, 250e6, 150, EXPIRES, shared));
    }
    uint256 loaded = gasleft();
    registry.matchesOf(shared);
    loaded = loaded - gasleft();

    for (uint256 i; i < 20; ++i) {
      bytes32 id = bytes32(uint256(0x1000 + i));
      _send(Reports.body(2, SELECTOR, _next(), id, SUBMISSION_1, BORROWER, 0, 0, 0, new bytes32[](0)));
    }
    uint256 reclaimed = gasleft();
    (bytes32 found, uint8 matched) = registry.matchesOf(shared);
    reclaimed = reclaimed - gasleft();

    assertEq(found, bytes32(0), "nothing active");
    assertEq(matched, 0, "nothing matched");
    // The dead entries are gone, not merely skipped.
    assertLt(reclaimed, loaded / 5, "the walk no longer pays for closed liens");
  }
}
