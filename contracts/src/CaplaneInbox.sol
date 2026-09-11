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

  /// @notice Block in which a submission id was first accepted; zero if never.
  /// @dev The permanent record. Log data is prunable — a full node keeps receipts for about
  ///      10,000 blocks — and this is not.
  mapping(bytes32 submissionId => uint256 blockNumber) public submittedAt;

  function submit(
    bytes32 submissionId,
    bytes calldata ciphertext
  ) external {
    if (ciphertext.length > MAX_ENVELOPE_BYTES) revert SubmissionTooLarge(ciphertext.length);

    bytes32 expected = keccak256(abi.encodePacked(msg.sender, ciphertext));
    if (submissionId != expected) revert WrongSubmissionId(expected, submissionId);
    if (submittedAt[submissionId] != 0) revert DuplicateSubmission(submissionId);

    submittedAt[submissionId] = block.number;
    emit ClaimSubmitted(submissionId, msg.sender, ciphertext);
  }
}
