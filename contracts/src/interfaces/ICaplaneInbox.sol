// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The system's only entry point. A submission is a transaction, not an API call:
///         no service sits in the trust path and none can read the claim.
interface ICaplaneInbox {
  error SubmissionTooLarge(uint256 length);
  error DuplicateSubmission(bytes32 submissionId);

  /// @param submissionId keccak256(abi.encodePacked(msg.sender, ciphertext)). Derived, never
  ///        caller-chosen, so it cannot be front-run onto a colliding value.
  /// @param ciphertext Sealed to the enclave's public key. Envelope shape is frozen in FREEZE.md.
  event ClaimSubmitted(bytes32 indexed submissionId, address indexed submitter, bytes ciphertext);

  function submit(
    bytes32 submissionId,
    bytes calldata ciphertext
  ) external;
}
