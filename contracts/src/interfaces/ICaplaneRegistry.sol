// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The lien registry's frozen surface. Its only write path is `onReport`,
///         reachable only through the Chainlink KeystoneForwarder and only for one workflow.
interface ICaplaneRegistry {
  /// @dev Field order is load-bearing: it packs into three storage slots.
  ///      `advanceUsdc6` is always base units of the USDC ERC-20 (6 decimals),
  ///      never native gas wei (18 decimals on Arc) and never the claim's own minor units.
  struct Lien {
    address borrower;
    uint32 rateBps;
    uint64 createdAt;
    uint128 advanceUsdc6;
    uint64 expiresAt;
    uint8 status;
    bytes32 submissionId;
  }

  error NotForwarder(address sender);
  error WrongWorkflowOwner(address workflowOwner);
  error WrongWorkflowName(bytes10 workflowName);
  error BadMetadata(uint256 length);
  error WrongChain(uint64 chainSelector);
  error ReportReplayed(bytes32 nonce);
  /// @param count How many component commitments the report carried.
  /// @dev Not `BadMetadata`: the forwarder's metadata can be well-formed while the report body
  ///      is not, and an error naming a field that did not fail is worse than no error.
  error WrongComponentCount(uint256 count);
  error AlreadyEncumbered(bytes32 lienId);
  error LienNotActive(bytes32 lienId);

  event LienRecorded(bytes32 indexed lienId, address indexed borrower, uint64 expiresAt);
  event LienReleased(bytes32 indexed lienId);
  event LienDefaulted(bytes32 indexed lienId);
  event SubmissionRejected(bytes32 indexed submissionId, uint8 reasonCode);

  /// @notice The registry's only write path.
  /// @param metadata 64 packed bytes from the forwarder. Never ABI-decode it.
  /// @param report The workflow's own payload, at most 5011 bytes.
  function onReport(
    bytes calldata metadata,
    bytes calldata report
  ) external;

  /// @notice Exact-identity lookup. Permissionless, readable from a block explorer.
  function isEncumbered(
    bytes32 lienId
  ) external view returns (bool);

  /// @notice Exact-identity lookup returning the raw status byte.
  function statusOf(
    bytes32 lienId
  ) external view returns (uint8);

  function lienOf(
    bytes32 lienId
  ) external view returns (Lien memory);

  /// @notice Batched component lookup for the enclave's fuzzy match.
  /// @dev A `view` reached by eth_call, so it is bounded by the node's call gas cap,
  ///      not by the block limit. One call keeps the workflow inside its 5-HTTP budget.
  /// @param componentCommitments Peppered per-component commitments, in canonical index order.
  /// @return lienId The active lien matching the most components, or zero.
  /// @return matched How many components that lien matched.
  function matchesOf(
    bytes32[] calldata componentCommitments
  ) external view returns (bytes32 lienId, uint8 matched);
}
