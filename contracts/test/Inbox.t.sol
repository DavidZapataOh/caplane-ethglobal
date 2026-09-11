// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplaneInbox} from "../src/CaplaneInbox.sol";
import {ICaplaneInbox} from "../src/interfaces/ICaplaneInbox.sol";
import {Test} from "forge-std/Test.sol";

contract InboxTest is Test {
  uint256 internal constant MAX = 4096;
  address internal constant SUBMITTER = address(0x50B);

  CaplaneInbox internal inbox;

  function setUp() public {
    inbox = new CaplaneInbox();
  }

  function _envelope(
    uint256 length
  ) internal pure returns (bytes memory e) {
    e = new bytes(length);
    for (uint256 i; i < length; ++i) {
      // casting to 'uint8' is safe because `i % 251 + 1` is in [1, 251], which is why 251 is
      // the modulus: it keeps every envelope byte non-zero, so the calldata floor binds the
      // way a real ciphertext makes it bind.
      // forge-lint: disable-next-line(unsafe-typecast)
      e[i] = bytes1(uint8(i % 251 + 1));
    }
  }

  function _id(
    bytes memory ciphertext
  ) internal view returns (bytes32) {
    return _idFor(address(this), ciphertext);
  }

  function _idFor(
    address who,
    bytes memory ciphertext
  ) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(who, ciphertext));
  }

  function _submit(
    address who,
    bytes memory ciphertext
  ) internal {
    vm.prank(who);
    inbox.submit(_idFor(who, ciphertext), ciphertext);
  }

  /// @dev An oversize event is dropped by the log trigger before an execution id exists: no
  ///      failed run, no retry, no trace. On-chain is the only place this can be refused.
  function test_Submit_RefusesAnEnvelopeOverTheBudget() public {
    bytes memory tooBig = _envelope(MAX + 1);
    vm.expectRevert(abi.encodeWithSelector(ICaplaneInbox.SubmissionTooLarge.selector, MAX + 1));
    inbox.submit(_id(tooBig), tooBig);
  }

  function test_Submit_AcceptsTheLargestEnvelopeTheBudgetAllows() public {
    bytes memory largest = _envelope(MAX);
    inbox.submit(_id(largest), largest);
    assertGt(inbox.submittedAt(_id(largest)), 0);
  }

  function test_Submit_EmitsTheClaimForTheEnclave() public {
    bytes memory envelope = _envelope(275);
    vm.expectEmit(true, true, false, true);
    emit ICaplaneInbox.ClaimSubmitted(_id(envelope), address(this), envelope);
    inbox.submit(_id(envelope), envelope);
  }

  function test_SubmittedAt_IsZeroForSomethingNeverSubmitted() public view {
    assertEq(inbox.submittedAt(keccak256("never happened")), 0);
  }

  /// @dev Without this check, a mempool observer front-runs any submission with the victim's
  ///      id and an empty ciphertext, burning that id for the price of one transaction.
  function test_Submit_RefusesAnIdThatIsNotDerivedFromTheSender() public {
    bytes memory envelope = _envelope(275);
    bytes32 chosen = keccak256("an id the caller picked");
    vm.expectRevert(abi.encodeWithSelector(ICaplaneInbox.WrongSubmissionId.selector, _id(envelope), chosen));
    inbox.submit(chosen, envelope);
  }

  /// @dev The same envelope from a different address derives a different id, so the sender is
  ///      part of the identity and nobody can occupy another sender's id space.
  function test_Submit_DerivesADifferentIdForADifferentSender() public {
    bytes memory envelope = _envelope(275);
    address other = address(0xA11CE);
    bytes32 mine = _id(envelope);
    bytes32 theirs = keccak256(abi.encodePacked(other, envelope));
    assertTrue(mine != theirs);

    vm.prank(other);
    vm.expectRevert(abi.encodeWithSelector(ICaplaneInbox.WrongSubmissionId.selector, theirs, mine));
    inbox.submit(mine, envelope);
  }

  /// @dev The squatting attempt itself, end to end: it must now revert rather than burn the
  ///      id, and it must revert saying WHAT was wrong — a bare expectRevert would pass on any
  ///      failure, including the one this test exists to rule out.
  function test_Submit_RefusesToBurnSomeoneElsesId() public {
    bytes memory victimEnvelope = _envelope(275);
    bytes32 victimId = _id(victimEnvelope);

    vm.prank(address(0xBAD));
    vm.expectRevert(
      abi.encodeWithSelector(
        ICaplaneInbox.WrongSubmissionId.selector, keccak256(abi.encodePacked(address(0xBAD), bytes(""))), victimId
      )
    );
    inbox.submit(victimId, "");

    inbox.submit(victimId, victimEnvelope);
    assertGt(inbox.submittedAt(victimId), 0, "the victim must still be able to submit");
  }

  /// @dev Order: size before derivation. An oversize envelope with a wrong id must report the
  ///      size, so the keccak is never run on unbounded input.
  function test_Submit_ReportsTheSizeBeforeTheDerivation() public {
    bytes memory tooBig = _envelope(MAX + 1);
    vm.expectRevert(abi.encodeWithSelector(ICaplaneInbox.SubmissionTooLarge.selector, MAX + 1));
    inbox.submit(keccak256("not the derived id"), tooBig);
  }

  function test_Submit_RefusesTheSameBytesFromTheSameSenderTwice() public {
    bytes memory envelope = _envelope(275);
    inbox.submit(_id(envelope), envelope);
    vm.expectRevert(abi.encodeWithSelector(ICaplaneInbox.DuplicateSubmission.selector, _id(envelope)));
    inbox.submit(_id(envelope), envelope);
  }

  /// @dev Re-encrypting is not a duplicate: a fresh ephemeral key and nonce make different
  ///      bytes and a different id. Deciding that two envelopes carry the same claim is the
  ///      enclave's job, and the chain must not pretend to do it — so BOTH must be on record.
  function test_Submit_KeepsBothRecordsWhenTheSameClaimIsSealedAgain() public {
    bytes memory first = _envelope(275);
    bytes memory second = _envelope(275);
    for (uint256 i = 2; i < 58; ++i) {
      second[i] = bytes1(uint8(0xFF - (i % 251))); // the ephemeral key and the nonce, per the envelope
    }

    inbox.submit(_id(first), first);
    vm.roll(block.number + 1);
    inbox.submit(_id(second), second);

    assertTrue(_id(first) != _id(second), "resealing must produce a different id");
    assertGt(inbox.submittedAt(_id(first)), 0, "the first record must survive the second");
    assertEq(inbox.submittedAt(_id(second)), block.number);
  }

  /// @dev The record that survives log pruning. A full node keeps receipts for roughly ten
  ///      thousand blocks; this mapping is state and is never pruned.
  function test_SubmittedAt_RecordsTheBlockAndIsPubliclyReadable() public {
    vm.roll(1_234_567);
    bytes memory envelope = _envelope(275);
    inbox.submit(_id(envelope), envelope);
    assertEq(inbox.submittedAt(_id(envelope)), 1_234_567);
  }

  /// @dev Order: derivation before duplicate. With the two swapped, a third party aiming at an
  ///      id already taken is told "you already sent this" — the exact lie the separate error
  ///      exists to prevent, and every other test stays green.
  function test_Submit_ReportsTheDerivationBeforeTheDuplicate() public {
    bytes memory envelope = _envelope(275);
    bytes32 taken = _id(envelope);
    inbox.submit(taken, envelope);

    vm.prank(address(0xBAD));
    vm.expectRevert(
      abi.encodeWithSelector(
        ICaplaneInbox.WrongSubmissionId.selector, keccak256(abi.encodePacked(address(0xBAD), envelope)), taken
      )
    );
    inbox.submit(taken, envelope);
  }

  /// @dev The submitter lives only in the log otherwise, and logs are pruned: a full node keeps
  ///      receipts for about ten thousand blocks, an hour and a half here. After that the link
  ///      between a lien's borrower and the person who submitted is unverifiable by any means.
  function test_SubmitterOf_SurvivesWhereTheLogWillNot() public {
    bytes memory envelope = _envelope(275);
    _submit(SUBMITTER, envelope);

    assertEq(inbox.submitterOf(_idFor(SUBMITTER, envelope)), SUBMITTER);
  }

  function test_SubmitterOf_IsZeroForSomethingNeverSubmitted() public view {
    assertEq(inbox.submitterOf(keccak256("never happened")), address(0));
  }

  /// @dev Both halves live in one word, so recording who submitted costs nothing beyond what
  ///      recording that they submitted already cost.
  function test_Submit_StillRecordsTheBlockAlongsideTheSubmitter() public {
    vm.roll(1_234_567);
    bytes memory envelope = _envelope(275);
    _submit(SUBMITTER, envelope);

    bytes32 id = _idFor(SUBMITTER, envelope);
    assertEq(inbox.submittedAt(id), 1_234_567);
    assertEq(inbox.submitterOf(id), SUBMITTER);
  }

  /// @dev One word, proven against storage rather than argued from field widths. A layout that
  ///      spilled would cost a second cold SSTORE on every submission and nothing else would say so.
  function test_Submit_KeepsBothHalvesInOneSlot() public {
    bytes memory envelope = _envelope(275);
    _submit(SUBMITTER, envelope);

    bytes32 slot = keccak256(abi.encode(_idFor(SUBMITTER, envelope), uint256(0)));
    bytes32 word = vm.load(address(inbox), slot);
    // Declaration order packs from the low end, so the block number is the low 96 bits and the
    // submitter the 160 above it — asserted in that order rather than assumed the other way.
    assertEq(uint256(word) & type(uint96).max, block.number, "the block number moved");
    assertEq(address(uint160(uint256(word) >> 96)), SUBMITTER, "the submitter moved");
    assertEq(vm.load(address(inbox), bytes32(uint256(slot) + 1)), bytes32(0), "it spilled");
  }

  /// @dev Duplicate detection hangs off the submitter, not the block number. At block zero the
  ///      block-number version accepts the same submission twice and silently overwrites it.
  function test_Submit_StillRefusesADuplicateAtBlockZero() public {
    vm.roll(0);
    bytes memory envelope = _envelope(275);
    _submit(SUBMITTER, envelope);

    bytes32 id = _idFor(SUBMITTER, envelope);
    vm.prank(SUBMITTER);
    vm.expectRevert(abi.encodeWithSelector(ICaplaneInbox.DuplicateSubmission.selector, id));
    inbox.submit(id, envelope);
  }
}
