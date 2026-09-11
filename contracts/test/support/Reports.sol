// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Builds the exact flat abi.encode `ReportCodec.decode` consumes. Field order is frozen,
///      so a change to the schema turns these tests red, which is the point.
library Reports {
  function body(
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
  ) internal pure returns (bytes memory) {
    return abi.encode(
      kind, chainSelector, nonce, lienId, submissionId, borrower, advanceUsdc6, rateBps, expiresAt, componentCommitments
    );
  }
}
