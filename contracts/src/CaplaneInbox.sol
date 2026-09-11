// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ICaplaneInbox} from "./interfaces/ICaplaneInbox.sol";

/// @notice The system's only entry point. A submission is a transaction, not an API call: no
///         service sits in the trust path and none can read the claim. There is no owner, no
///         admin and no pause, and the contract holds no configuration at all.
contract CaplaneInbox is ICaplaneInbox {
  /// @dev Bounds the whole envelope, not the ciphertext alone — the frozen parameter is named
  ///      `ciphertext` but carries version, algorithm, ephemeral key, nonce and ciphertext.
  ///      Not a gas guard: a transaction may legally carry far more. It is the CRE log-trigger
  ///      budget expressed in Solidity. At this length the ABI-encoded event data is 4,160
  ///      bytes and the whole serialized log is about 4,400 of the 5,000 the trigger allows.
  ///      An event above that budget is dropped before an execution exists — no failure, no
  ///      retry, no trace — so refusing it here is the only place the submitter learns.
  uint256 private constant MAX_ENVELOPE_BYTES = 4096;

  struct Submission {
    uint96 blockNumber;
    address submitter;
  }

  /// @dev One word: 96 bits of block number beside a 160-bit address. The width is what is left
  ///      over rather than what is needed — at half a second a block a uint96 outlasts the age
  ///      of the universe — and packing costs nothing, because an SSTORE from zero prices the
  ///      slot and not its contents. This is the permanent record: log data is prunable and
  ///      contract state is not.
  mapping(bytes32 submissionId => Submission) private _submissions;

  /// @inheritdoc ICaplaneInbox
  function submittedAt(
    bytes32 submissionId
  ) external view returns (uint256) {
    return _submissions[submissionId].blockNumber;
  }

  /// @inheritdoc ICaplaneInbox
  function submitterOf(
    bytes32 submissionId
  ) external view returns (address) {
    return _submissions[submissionId].submitter;
  }

  function submit(
    bytes32 submissionId,
    bytes calldata ciphertext
  ) external {
    if (ciphertext.length > MAX_ENVELOPE_BYTES) revert SubmissionTooLarge(ciphertext.length);

    bytes32 expected = keccak256(abi.encodePacked(msg.sender, ciphertext));
    if (submissionId != expected) revert WrongSubmissionId(expected, submissionId);
    // Keyed on the submitter, not on the block: at block zero a block-number check accepts the
    // same submission twice and silently overwrites the record. Neither half is infallible —
    // a submission pranked from the zero address would break this one — but the submitter is
    // the half a real transaction always fills in.
    if (_submissions[submissionId].submitter != address(0)) revert DuplicateSubmission(submissionId);

    _submissions[submissionId] = Submission({blockNumber: uint96(block.number), submitter: msg.sender});
    emit ClaimSubmitted(submissionId, msg.sender, ciphertext);
  }
}
