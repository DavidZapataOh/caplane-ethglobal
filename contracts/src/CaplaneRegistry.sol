// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ICaplaneRegistry} from "./interfaces/ICaplaneRegistry.sol";
import {ReportCodec} from "./libraries/ReportCodec.sol";

/// @notice The lien registry. Its only write path is `onReport`, reachable only through the
///         Chainlink KeystoneForwarder and only for one workflow. There is no owner, no admin,
///         no proxy and no pause: nobody, including the authors, can alter an entry.
contract CaplaneRegistry is ICaplaneRegistry {
  /// @dev Declared here rather than on the interface: it concerns construction, not the surface
  ///      four workstreams build against, so the frozen ABI is untouched.
  error ZeroAddress();

  address public immutable FORWARDER;
  address public immutable WORKFLOW_OWNER;
  bytes10 public immutable WORKFLOW_NAME;
  uint64 public immutable CHAIN_SELECTOR;

  uint256 private constant COMPONENTS = 7;

  mapping(bytes32 lienId => Lien) private _liens;
  mapping(bytes32 lienId => bytes32[COMPONENTS]) private _commitments;
  mapping(bytes32 nonce => bool) private _used;
  mapping(bytes32 commitment => bytes32[] lienIds) private _postings;

  constructor(
    address forwarder,
    address workflowOwner,
    bytes10 workflowName,
    uint64 chainSelector
  ) {
    // Both are immutable and there is no setter. A zero forwarder leaves the registry with no
    // write path it can ever accept; a zero owner rejects every report. Either is a silent,
    // permanent brick discovered only when the first real report bounces.
    if (forwarder == address(0) || workflowOwner == address(0)) revert ZeroAddress();

    FORWARDER = forwarder;
    WORKFLOW_OWNER = workflowOwner;
    WORKFLOW_NAME = workflowName;
    CHAIN_SELECTOR = chainSelector;
  }

  function supportsInterface(
    bytes4 interfaceId
  ) external pure returns (bool) {
    return interfaceId == ICaplaneRegistry.onReport.selector || interfaceId == bytes4(0x01ffc9a7);
  }

  function onReport(
    bytes calldata metadata,
    bytes calldata report
  ) external {
    if (msg.sender != FORWARDER) revert NotForwarder(msg.sender);
    if (metadata.length < 62) revert BadMetadata(metadata.length);

    (bytes10 workflowName, address workflowOwner) = _identity(metadata);
    if (workflowOwner != WORKFLOW_OWNER) revert WrongWorkflowOwner(workflowOwner);
    if (workflowName != WORKFLOW_NAME) revert WrongWorkflowName(workflowName);

    ReportCodec.ReportBody memory body = ReportCodec.decode(report);
    if (body.chainSelector != CHAIN_SELECTOR) revert WrongChain(body.chainSelector);
    if (_used[body.nonce]) revert ReportReplayed(body.nonce);
    _used[body.nonce] = true;

    if (body.kind == ReportCodec.ReportKind.Record) {
      _recordLien(body);
    } else if (body.kind == ReportCodec.ReportKind.Release) {
      _close(body.lienId, 2);
      emit LienReleased(body.lienId);
    } else if (body.kind == ReportCodec.ReportKind.Default) {
      // A validator can nudge the timestamp by seconds; a term is measured in days, and the
      // lifecycle rule requires default to come after expiry. Seconds of slack cannot make an
      // unexpired lien look expired at this scale.
      // forge-lint: disable-next-line(block-timestamp)
      if (block.timestamp < _liens[body.lienId].expiresAt) revert LienNotActive(body.lienId);
      _close(body.lienId, 3);
      emit LienDefaulted(body.lienId);
    } else if (body.kind == ReportCodec.ReportKind.Reject) {
      if (body.rateBps > type(uint8).max) revert WrongComponentCount(body.rateBps);
      emit SubmissionRejected(body.submissionId, uint8(body.rateBps));
    } else {
      revert LienNotActive(body.lienId);
    }
  }

  function _close(
    bytes32 lienId,
    uint8 status
  ) private {
    if (_liens[lienId].status != 1) revert LienNotActive(lienId);
    _liens[lienId].status = status;
  }

  /// @dev Not `BadMetadata`: the metadata was well-formed and the report body was not, so that
  ///      error would name a field that did not fail.
  function _recordLien(
    ReportCodec.ReportBody memory body
  ) private {
    if (body.componentCommitments.length != COMPONENTS) {
      revert WrongComponentCount(body.componentCommitments.length);
    }
    if (_liens[body.lienId].status != 0) revert AlreadyEncumbered(body.lienId);

    _liens[body.lienId] = Lien({
      borrower: body.borrower,
      rateBps: body.rateBps,
      createdAt: uint64(block.timestamp),
      advanceUsdc6: body.advanceUsdc6,
      expiresAt: body.expiresAt,
      status: 1,
      submissionId: body.submissionId
    });

    for (uint256 i; i < COMPONENTS; ++i) {
      _commitments[body.lienId][i] = body.componentCommitments[i];
    }

    uint256[3] memory positions = _indexedPositions();
    for (uint256 p; p < positions.length; ++p) {
      _postings[body.componentCommitments[positions[p]]].push(body.lienId);
    }

    emit LienRecorded(body.lienId, body.borrower, body.expiresAt);
  }

  function isEncumbered(
    bytes32 lienId
  ) external view returns (bool) {
    return _liens[lienId].status == 1;
  }

  function statusOf(
    bytes32 lienId
  ) external view returns (uint8) {
    return _liens[lienId].status;
  }

  function lienOf(
    bytes32 lienId
  ) external view returns (Lien memory) {
    return _liens[lienId];
  }

  function matchesOf(
    bytes32[] calldata componentCommitments
  ) external view returns (bytes32 lienId, uint8 matched) {
    if (componentCommitments.length != COMPONENTS) return (bytes32(0), 0);

    uint256[3] memory positions = _indexedPositions();
    for (uint256 p; p < positions.length; ++p) {
      bytes32[] storage candidates = _postings[componentCommitments[positions[p]]];
      uint256 n = candidates.length;

      for (uint256 c; c < n; ++c) {
        bytes32 id = candidates[c];
        if (_liens[id].status != 1) continue;

        bytes32[COMPONENTS] storage stored = _commitments[id];
        uint8 score;
        for (uint256 j; j < COMPONENTS; ++j) {
          if (stored[j] == componentCommitments[j]) {
            unchecked {
              ++score;
            }
          }
        }

        // A total order on ties: two nodes running the same call must return the same lien.
        if (score > matched || (score == matched && score != 0 && id < lienId)) {
          matched = score;
          lienId = id;
        }
      }
    }
  }

  /// @dev Positions 0, 1 and 3 of the tuple: debtor, invoice number, due date. The amount bucket
  ///      is position 2 and is deliberately absent — a doubling bucket takes a handful of values,
  ///      so one posting list would hold a large share of the registry and the walk would grow
  ///      with it. At the 6-of-7 threshold at most one discriminating component differs, so at
  ///      least two of these three still agree: indexing three cannot miss a match. A pure
  ///      function rather than a state array: this contract holds no mutable state but liens.
  function _indexedPositions() private pure returns (uint256[3] memory) {
    return [uint256(0), 1, 3];
  }

  /// @dev Offsets are Chainlink's own: the 32-byte length prefix, then workflowId, name, owner.
  function _identity(
    bytes memory metadata
  ) private pure returns (bytes10 workflowName, address workflowOwner) {
    bytes20 owner;
    assembly {
      workflowName := mload(add(metadata, 64))
      owner := mload(add(metadata, 74))
    }
    workflowOwner = address(owner);
  }
}
