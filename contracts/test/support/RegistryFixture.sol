// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplaneRegistry} from "../../src/CaplaneRegistry.sol";
import {Forwarder} from "./Forwarder.sol";
import {Reports} from "./Reports.sol";
import {Test} from "forge-std/Test.sol";

abstract contract RegistryFixture is Test {
  address internal constant OWNER = 0xd5557A1d0806323caD77bC4049ccaca0EaDAaf06;
  // casting to 'bytes10' is safe because the literal is exactly ten ASCII characters: the
  // first ten hex digits of the workflow name's digest, which is what the forwarder packs.
  // forge-lint: disable-next-line(unsafe-typecast)
  bytes10 internal constant NAME = bytes10(bytes("6361706c61"));
  uint64 internal constant SELECTOR = 3_034_092_155_422_581_607;

  address internal constant BORROWER = address(0xB0110E1);
  bytes32 internal constant LIEN_A = bytes32(uint256(0xA));
  bytes32 internal constant SUBMISSION_1 = bytes32(uint256(0x5AB));
  uint64 internal constant EXPIRES = 1_900_000_000;

  CaplaneRegistry internal registry;
  Forwarder internal forwarder;
  uint256 private _seq;

  function setUp() public virtual {
    forwarder = new Forwarder();
    registry = new CaplaneRegistry(address(forwarder), OWNER, NAME, SELECTOR);
  }

  /// @dev `forwarder.metadata(...)` is an external call, so it consumes a prank and any armed
  ///      `expectRevert`. Hoisting it inside this helper is not enough: a test that arms
  ///      `expectRevert` and then calls `_send` still loses it to the metadata call. Any test
  ///      asserting a revert must build the metadata FIRST, with `_metadata()`, and then arm.
  function _send(
    bytes memory report
  ) internal {
    bytes memory m = _metadata();
    vm.prank(address(forwarder));
    registry.onReport(m, report);
  }

  function _metadata() internal view returns (bytes memory) {
    return forwarder.metadata(OWNER, NAME);
  }

  /// @dev The shape every revert test needs: metadata built before the cheatcodes are armed.
  function _sendFrom(
    bytes memory m,
    bytes memory report
  ) internal {
    vm.prank(address(forwarder));
    registry.onReport(m, report);
  }

  /// @dev Replay protection is real, so every helper mints a fresh nonce. A test reusing one
  ///      would fail for a reason unrelated to what it asserts.
  function _next() internal returns (bytes32) {
    unchecked {
      return bytes32(++_seq);
    }
  }

  /// @dev Seven commitments that collide with nothing already stored.
  function _fresh() internal returns (bytes32[] memory q) {
    q = new bytes32[](7);
    for (uint256 i; i < 7; ++i) {
      q[i] = keccak256(abi.encodePacked(_next(), i));
    }
  }

  function _record(
    bytes32 lienId,
    uint128 advance,
    uint32 rateBps,
    uint64 expiresAt
  ) internal {
    _send(Reports.body(1, SELECTOR, _next(), lienId, SUBMISSION_1, BORROWER, advance, rateBps, expiresAt, _fresh()));
  }

  /// @dev A lien that really exists: written through the registry's only write path, with a
  ///      signed report, so nothing downstream is testing against a shape the chain would
  ///      refuse. The id is derived from the commitments the way the enclave derives it.
  function _activeLien(
    address borrower,
    uint128 advance,
    uint32 rateBps
  ) internal returns (bytes32 lienId) {
    bytes32[] memory c = _fresh();
    lienId = keccak256(abi.encodePacked(c[0], c[1], c[2], c[3], c[4], c[5], c[6]));
    _send(Reports.body(1, SELECTOR, _next(), lienId, SUBMISSION_1, borrower, advance, rateBps, EXPIRES, c));
  }

  function _release(
    bytes32 lienId
  ) internal {
    _send(Reports.body(2, SELECTOR, _next(), lienId, SUBMISSION_1, BORROWER, 0, 0, 0, _fresh()));
  }

  function _default(
    bytes32 lienId
  ) internal {
    _send(Reports.body(3, SELECTOR, _next(), lienId, SUBMISSION_1, BORROWER, 0, 0, 0, _fresh()));
  }

  function _reject(
    bytes32 submissionId,
    uint32 reason
  ) internal {
    _send(Reports.body(4, SELECTOR, _next(), bytes32(0), submissionId, address(0), 0, reason, 0, _fresh()));
  }
}
