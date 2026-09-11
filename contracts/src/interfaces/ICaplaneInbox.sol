// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The system's only entry point. A submission is a transaction, not an API call:
///         no service sits in the trust path and none can read the claim.
interface ICaplaneInbox {
  error SubmissionTooLarge(uint256 length);
  error DuplicateSubmission(bytes32 submissionId);

  /// @param expected keccak256(abi.encodePacked(msg.sender, ciphertext)).
  /// @param given What the caller passed. Derivation is enforced, not assumed: a caller-chosen
  ///        id lets a mempool observer burn someone else's id for the price of one transaction.
  error WrongSubmissionId(bytes32 expected, bytes32 given);

  /// @param submissionId keccak256(abi.encodePacked(msg.sender, ciphertext)). Derived, never
  ///        caller-chosen, so it cannot be front-run onto a colliding value.
  /// @param ciphertext Sealed to the enclave's public key. Envelope shape is frozen in FREEZE.md.
  event ClaimSubmitted(bytes32 indexed submissionId, address indexed submitter, bytes ciphertext);

  function submit(
    bytes32 submissionId,
    bytes calldata ciphertext
  ) external;

  /// @notice Block in which a submission id was first accepted; zero if never.
  function submittedAt(
    bytes32 submissionId
  ) external view returns (uint256);

  /// @notice Who sent that submission, or the zero address if nobody did.
  /// @dev The log carries this too, and log data is prunable — a full node keeps receipts for
  ///      roughly ten thousand blocks. Without this, the link between a lien's borrower and the
  ///      person who submitted stops being checkable by any means about ninety minutes later.
  function submitterOf(
    bytes32 submissionId
  ) external view returns (address);
}
