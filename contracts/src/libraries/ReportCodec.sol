// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The report payload the workflow produces and the registry consumes.
/// @dev Flat abi.encode of a fixed field order. Not a nested onReport calldata blob —
///      that shape appears in an SDK sample and is an anti-pattern.
///      `chainSelector` and `nonce` are carried because DON signatures commit to neither
///      a chain nor a receiver, so any compatible forwarder would accept a replayed report.
library ReportCodec {
  enum ReportKind {
    Unset,
    Record,
    Release,
    Default,
    Reject
  }

  struct ReportBody {
    ReportKind kind;
    uint64 chainSelector;
    bytes32 nonce;
    bytes32 lienId;
    bytes32 submissionId;
    address borrower;
    uint128 advanceUsdc6;
    uint32 rateBps;
    uint64 expiresAt;
    bytes32[] componentCommitments;
  }

  function decode(
    bytes memory report
  ) internal pure returns (ReportBody memory) {
    (
      uint8 kind,
      uint64 chainSelector,
      bytes32 nonce,
      bytes32 lienId,
      bytes32 submissionId,
      address borrower,
      uint128 advanceUsdc6,
      uint32 rateBps,
      uint64 expiresAt,
      bytes32[] memory componentCommitments
    ) = abi.decode(report, (uint8, uint64, bytes32, bytes32, bytes32, address, uint128, uint32, uint64, bytes32[]));

    return ReportBody({
      kind: ReportKind(kind),
      chainSelector: chainSelector,
      nonce: nonce,
      lienId: lienId,
      submissionId: submissionId,
      borrower: borrower,
      advanceUsdc6: advanceUsdc6,
      rateBps: rateBps,
      expiresAt: expiresAt,
      componentCommitments: componentCommitments
    });
  }
}
