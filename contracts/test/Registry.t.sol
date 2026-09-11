// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplaneRegistry} from "../src/CaplaneRegistry.sol";
import {ICaplaneRegistry} from "../src/interfaces/ICaplaneRegistry.sol";
import {RegistryFixture} from "./support/RegistryFixture.sol";
import {Reports} from "./support/Reports.sol";

contract RegistryTest is RegistryFixture {
  function test_OnReport_RejectsAnyoneButTheForwarder() public {
    bytes memory m = forwarder.metadata(OWNER, NAME);
    vm.prank(address(0xBAD));
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.NotForwarder.selector, address(0xBAD)));
    registry.onReport(m, "");
  }

  /// @dev A published Chainlink template ships `require(metadata.length == 62)` and reverts on
  ///      every production delivery, which is 64 bytes. The assertion is a revert that can only
  ///      be reached AFTER the metadata guard: a regression to `== 62` would answer
  ///      `BadMetadata(64)` instead, and this test would fail rather than pass quietly.
  function test_OnReport_AcceptsSixtyFourByteMetadata() public {
    uint64 ethereum = 5_009_297_550_715_157_269;
    bytes memory report =
      Reports.body(1, ethereum, _next(), LIEN_A, SUBMISSION_1, BORROWER, 250_000_000, 150, EXPIRES, _fresh());
    bytes memory m = _metadata();
    assertEq(m.length, 64);
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.WrongChain.selector, ethereum));
    _sendFrom(m, report);
  }

  function test_OnReport_RejectsTruncatedMetadata() public {
    bytes memory short = new bytes(61);
    vm.prank(address(forwarder));
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.BadMetadata.selector, uint256(61)));
    registry.onReport(short, "");
  }

  function test_OnReport_RejectsAnotherOrganisationsWorkflow() public {
    address stranger = address(0xA11CE);
    bytes memory m = forwarder.metadata(stranger, NAME);
    vm.prank(address(forwarder));
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.WrongWorkflowOwner.selector, stranger));
    registry.onReport(m, "");
  }

  /// @dev The owner is shared by every workflow in the organisation, so our own second workflow
  ///      would pass the owner check. The name is what separates them.
  function test_OnReport_RejectsOurOwnOtherWorkflow() public {
    // casting to 'bytes10' is safe because the literal is exactly ten characters
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes10 other = bytes10(bytes("deadbeefca"));
    bytes memory m = forwarder.metadata(OWNER, other);
    vm.prank(address(forwarder));
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.WrongWorkflowName.selector, other));
    registry.onReport(m, "");
  }

  function test_SupportsInterface_AnswersAllThreeProbes() public view {
    assertTrue(registry.supportsInterface(0x805f2132));
    assertTrue(registry.supportsInterface(0x01ffc9a7));
    assertFalse(registry.supportsInterface(0xffffffff));
  }

  function test_SupportsInterface_CostsLessThanTheStipend() public view {
    uint256 before = gasleft();
    registry.supportsInterface(0x805f2132);
    assertLt(before - gasleft(), 30_000);
  }

  function test_Record_WritesAnActiveLienStampedByTheChain() public {
    vm.warp(1_800_000_000);
    _record(LIEN_A, 250_000_000, 150, EXPIRES);

    ICaplaneRegistry.Lien memory lien = registry.lienOf(LIEN_A);
    assertEq(lien.status, 1);
    assertEq(lien.borrower, BORROWER);
    assertEq(lien.advanceUsdc6, 250_000_000);
    assertEq(lien.rateBps, 150);
    assertEq(lien.expiresAt, EXPIRES);
    // From the chain, never from the report: an enclave clock is unverifiable.
    assertEq(lien.createdAt, 1_800_000_000);
    assertTrue(registry.isEncumbered(LIEN_A));
  }

  function test_Record_EmitsLienRecorded() public {
    vm.expectEmit(true, true, false, true);
    emit ICaplaneRegistry.LienRecorded(LIEN_A, BORROWER, EXPIRES);
    _record(LIEN_A, 250_000_000, 150, EXPIRES);
  }

  function test_Record_RefusesAnAlreadyActiveLien() public {
    _record(LIEN_A, 250_000_000, 150, EXPIRES);

    bytes memory again =
      Reports.body(1, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 250_000_000, 150, EXPIRES, _fresh());
    bytes memory m = _metadata();
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.AlreadyEncumbered.selector, LIEN_A));
    _sendFrom(m, again);
  }

  /// @dev A DON signature commits to neither a chain nor a receiver, so a report minted for
  ///      another chain is perfectly signed and must be refused here.
  function test_Record_RefusesAReportMintedForAnotherChain() public {
    uint64 ethereum = 5_009_297_550_715_157_269;
    bytes memory report =
      Reports.body(1, ethereum, _next(), LIEN_A, SUBMISSION_1, BORROWER, 250_000_000, 150, EXPIRES, _fresh());
    bytes memory m = _metadata();
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.WrongChain.selector, ethereum));
    _sendFrom(m, report);
  }

  function test_Record_RefusesTheSameReportTwice() public {
    bytes32 nonce = _next();
    bytes memory report =
      Reports.body(1, SELECTOR, nonce, LIEN_A, SUBMISSION_1, BORROWER, 250_000_000, 150, EXPIRES, _fresh());
    _send(report);

    bytes memory m = _metadata();
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.ReportReplayed.selector, nonce));
    _sendFrom(m, report);
  }

  /// @dev A short array would Panic inside onReport, and a panic there is unrecoverable: the
  ///      forwarder marks the transmission and every retry reverts AlreadyAttempted.
  function test_Record_RefusesAReportCarryingTheWrongNumberOfCommitments() public {
    bytes32[] memory six = new bytes32[](6);
    bytes memory report =
      Reports.body(1, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 250_000_000, 150, EXPIRES, six);
    bytes memory m = _metadata();
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.WrongComponentCount.selector, uint256(6)));
    _sendFrom(m, report);
  }

  function test_Release_MovesAnActiveLienToReleased() public {
    _record(LIEN_A, 250_000_000, 150, EXPIRES);
    vm.expectEmit(true, false, false, false);
    emit ICaplaneRegistry.LienReleased(LIEN_A);
    _release(LIEN_A);
    assertEq(registry.statusOf(LIEN_A), 2);
    assertFalse(registry.isEncumbered(LIEN_A));
  }

  function test_Release_RefusesALienThatIsNotActive() public {
    _record(LIEN_A, 250_000_000, 150, EXPIRES);
    _release(LIEN_A);

    bytes memory report = Reports.body(2, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 0, 0, 0, _fresh());
    bytes memory m = _metadata();
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.LienNotActive.selector, LIEN_A));
    _sendFrom(m, report);
  }

  /// @dev Without this check the DON could declare a default before the term ended, and the
  ///      lifecycle rule would be decorative.
  function test_Default_RefusesToFireBeforeExpiry() public {
    vm.warp(1_800_000_000);
    _record(LIEN_A, 250_000_000, 150, uint64(1_800_000_000 + 30 days));

    bytes memory report = Reports.body(3, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 0, 0, 0, _fresh());
    bytes memory m = _metadata();
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.LienNotActive.selector, LIEN_A));
    _sendFrom(m, report);
  }

  function test_Default_FiresOnceTheTermHasPassed() public {
    vm.warp(1_800_000_000);
    _record(LIEN_A, 250_000_000, 150, uint64(1_800_000_000 + 30 days));
    vm.warp(1_800_000_000 + 30 days);
    _default(LIEN_A);
    assertEq(registry.statusOf(LIEN_A), 3);
  }

  /// @dev The safe direction. An expired, unreleased lien still reads encumbered: the
  ///      alternative lets a post-expiry re-pledge through.
  function test_IsEncumbered_StaysTrueAfterExpiryUntilAReportSaysOtherwise() public {
    vm.warp(1_800_000_000);
    _record(LIEN_A, 250_000_000, 150, uint64(1_800_000_000 + 30 days));
    vm.warp(1_800_000_000 + 3650 days);
    assertTrue(registry.isEncumbered(LIEN_A));
  }

  /// @dev The one branch of the single write path that writes no lien state. The lien is
  ///      recorded first so the assertion can actually fail if the branch touches it.
  function test_Reject_EmitsTheReasonAndLeavesTheLienUntouched() public {
    _record(LIEN_A, 250_000_000, 150, EXPIRES);
    vm.expectEmit(true, false, false, true);
    emit ICaplaneRegistry.SubmissionRejected(SUBMISSION_1, 1);
    _reject(SUBMISSION_1, 1);
    assertEq(registry.statusOf(LIEN_A), 1);
    assertEq(registry.lienOf(LIEN_A).advanceUsdc6, 250_000_000);
  }

  /// @dev The reason code rides in `rateBps` because the frozen schema has no field for it.
  ///      A value that does not fit a byte would silently emit a different reason. The error is
  ///      the count one: what failed is a field of the report body, not the metadata.
  function test_Reject_RefusesAReasonCodeThatDoesNotFitAByte() public {
    bytes memory report = Reports.body(4, SELECTOR, _next(), bytes32(0), SUBMISSION_1, address(0), 0, 256, 0, _fresh());
    bytes memory m = _metadata();
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.WrongComponentCount.selector, uint256(256)));
    _sendFrom(m, report);
  }

  function test_OnReport_RefusesAnUnsetReportKind() public {
    bytes memory report = Reports.body(0, SELECTOR, _next(), LIEN_A, SUBMISSION_1, BORROWER, 0, 0, 0, _fresh());
    bytes memory m = _metadata();
    vm.expectRevert(abi.encodeWithSelector(ICaplaneRegistry.LienNotActive.selector, LIEN_A));
    _sendFrom(m, report);
  }

  /// @dev No tool enforces this. A single isolated test was measured burning 60,822,041 gas and
  ///      passed — 3.6x the per-transaction cap and twice Arc's block limit — so the chain's own
  ///      ceilings only exist here. Run under `--isolate` or the figure misses the intrinsic
  ///      charge and the calldata, about 30,000 too little on this path.
  function test_OnReport_FitsInATransactionAndLeavesRoomInTheBlock() public {
    uint256 before = gasleft();
    _record(LIEN_A, 250_000_000, 150, EXPIRES);
    uint256 spent = before - gasleft();

    assertLt(spent, 16_777_216, "past the EIP-7825 per-transaction cap");
    assertLt(spent, 30_000_000 / 4, "one report must not take a quarter of a block");
  }

  /// @dev A zero forwarder leaves the registry with no write path that could ever be accepted,
  ///      and there is no setter to repair it. The contract-local error keeps this off the
  ///      frozen interface.
  function test_Constructor_RefusesAZeroForwarder() public {
    vm.expectRevert(CaplaneRegistry.ZeroAddress.selector);
    new CaplaneRegistry(address(0), OWNER, NAME, SELECTOR);
  }
}
