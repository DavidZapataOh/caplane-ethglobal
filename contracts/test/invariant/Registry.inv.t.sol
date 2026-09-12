// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplaneRegistry} from "../../src/CaplaneRegistry.sol";
import {Forwarder} from "../support/Forwarder.sol";
import {RegistryFixture} from "../support/RegistryFixture.sol";
import {Reports} from "../support/Reports.sol";
import {Ghosts} from "./Ghosts.sol";
import {RegistryHandler} from "./Handlers.sol";

/// @dev Bounded on purpose. Every invariant here walks the whole recorded population after
///      every sequenced call, so the run is quadratic in depth; the default profile's 256x500
///      spends minutes to reach states a few thousand calls already reach. Inline config keeps
///      it honest in both profiles rather than depending on which one the caller picked.
/// forge-config: default.invariant.runs = 32
/// forge-config: default.invariant.depth = 64
/// forge-config: ci.invariant.runs = 64
/// forge-config: ci.invariant.depth = 48
contract RegistryInvariantsTest is RegistryFixture {
  /// @dev How much of the population the order-independence replay covers. The tuple pool is
  ///      five debtors by four due dates, so posting lists collide inside the first handful.
  uint256 internal constant REPLAY = 32;
  address internal constant ACTOR_A = address(0xA11CE);
  address internal constant ACTOR_B = address(0xB0B);

  Ghosts internal ghosts;
  RegistryHandler internal handler;

  function setUp() public override {
    super.setUp();
    ghosts = new Ghosts();
    handler = new RegistryHandler(registry, forwarder, ghosts, OWNER, NAME, SELECTOR);
    targetContract(address(handler));
    // Not a performance tweak. Without this the fuzzer draws a fresh random sender per call and
    // the toolchain enforces Arc's blocked-sender rules, so a run either rate-limits a forked
    // endpoint or dies outright on `Blocked address`. Pinned, it costs seconds.
    targetSender(ACTOR_A);
    targetSender(ACTOR_B);
  }

  /// @dev Default is the one terminal state, and it is terminal for ever. A written-down lien
  ///      must never become active again: the pool has already taken the loss against it.
  ///
  ///      Status is deliberately NOT monotonic any more. It used to be, and that was the defect:
  ///      the record guard was `status != 0`, so a RELEASED lien kept its key for ever — and the
  ///      key is deterministic over the claim, so a paid invoice could never be financed again.
  ///      Releasing exists precisely to give the receivable back, so `2 -> 1` is the transition
  ///      the system is for.
  function invariant_DefaultIsTerminal() public view {
    for (uint256 i; i < ghosts.allLienIdsLength(); ++i) {
      bytes32 id = ghosts.allLienIds(i);
      if (ghosts.everDefaulted(id)) assertEq(uint256(registry.statusOf(id)), 3, "default reopened");
    }
  }

  /// @dev A lien may become active more than once, but every re-entry has to be paid for by a
  ///      release. One entry is free — the first record — and each one after it must be preceded
  ///      by the receivable being handed back.
  ///
  ///      Note this deliberately does NOT say "a defaulted lien was never re-entered": a lien can
  ///      legitimately be recorded, released, recorded again, and only then default. What makes a
  ///      default unreopenable is `invariant_DefaultIsTerminal`, plus the record guard refusing
  ///      status 3 — not a count.
  function invariant_ActiveIsEarnedByRelease() public view {
    for (uint256 i; i < ghosts.allLienIdsLength(); ++i) {
      bytes32 id = ghosts.allLienIds(i);
      assertLe(ghosts.enteredActiveCount(id), ghosts.releaseCount(id) + 1, "active without a release");
    }
  }

  /// @dev A lien the fuzzy lookup hands back must be one a caller can act on. Returning a
  ///      released or defaulted lien would let a second financier see an encumbrance that is
  ///      already gone, or miss one that is not.
  function invariant_MatchesOfOnlyEverReturnsAnActiveLien() public view {
    if (handler.recordedLength() == 0) return;
    for (uint256 i; i < handler.recordedLength() && i < 8; ++i) {
      bytes32[] memory q = handler.tupleFor(handler.recordedSeeds(i));
      (bytes32 id, uint8 matched) = registry.matchesOf(q);
      if (id == bytes32(0)) continue;
      assertEq(uint256(registry.statusOf(id)), 1, "returned a lien that is not active");
      assertGt(matched, 0, "returned a lien with no agreement at all");
    }
  }

  /// @dev Two nodes running the same `eth_call` must agree, so the answer cannot depend on the
  ///      order liens were written in. Replays the population the fuzzer built into a second
  ///      registry backwards, applies the same terminal transitions, and asks both the same
  ///      questions. The transitions are not optional: replaying only the records compares two
  ///      different populations and reports an order dependency that is not one.
  function afterInvariant() public {
    _assertEveryActionRan();

    uint256 n = handler.recordedLength();
    if (n == 0) return;

    Forwarder f = new Forwarder();
    CaplaneRegistry mirror = new CaplaneRegistry(address(f), OWNER, NAME, SELECTOR);
    uint256 nonce;

    // Backwards, and each lien once. A lien can now be recorded more than once — record, release,
    // record — because releasing gives the receivable back, so replaying the raw history would
    // ask the mirror to record an already-active lien and it would rightly refuse. What this is
    // checking is that the ANSWER does not depend on insertion order, so the mirror is built from
    // the final population, not from the sequence that produced it.
    for (uint256 i = n; i > 0; --i) {
      bytes32 id = handler.recordedLien(i - 1);
      if (mirror.statusOf(id) != 0) continue;
      _mirror(mirror, f, ++nonce, 1, handler.recordedSeeds(i - 1));
    }
    for (uint256 i; i < n; ++i) {
      bytes32 id = handler.recordedLien(i);
      uint8 status = registry.statusOf(id);
      if ((status == 2 || status == 3) && mirror.statusOf(id) == 1) {
        _mirror(mirror, f, ++nonce, status, handler.recordedSeeds(i));
      }
    }

    for (uint256 i; i < n && i < 8; ++i) {
      bytes32[] memory q = handler.tupleFor(handler.recordedSeeds(i));
      (bytes32 idA, uint8 mA) = registry.matchesOf(q);
      (bytes32 idB, uint8 mB) = mirror.matchesOf(q);
      assertEq(idA, idB, "the answer depends on insertion order");
      assertEq(mA, mB, "the score depends on insertion order");
    }
  }

  /// @dev Separates "the invariants held" from "nothing ran". Two failure modes, and they need
  ///      different checks, which is why this asserts REACHED rather than SUCCEEDED:
  ///
  ///      An action the fuzzer never calls — misnamed, or dropped from the target selectors —
  ///      is caught here, every run, because a reached action always increments one of the two
  ///      counters.
  ///
  ///      An action that can never succeed is caught by `test_Handler_EveryActionSucceedsOnce`,
  ///      which drives the same handler through a scripted sequence. Asserting success here
  ///      instead would be flaky by construction: whether a release lands inside forty random
  ///      calls is luck, and a gate that fails on luck gets switched off.
  ///
  ///      It also lives here rather than in an `invariant_` function because Foundry evaluates
  ///      those once before the first call, when every counter is legitimately zero.
  function _assertEveryActionRan() private view {
    for (uint256 i; i < ghosts.exposedSelectorCount(); ++i) {
      bytes4 sel = ghosts.exposedSelector(i);
      assertGt(
        ghosts.callsBySelector(sel) + ghosts.revertsBySelector(sel),
        0,
        string.concat("the fuzzer never reached a handler action: ", vm.toString(sel))
      );
    }
  }

  /// @dev The other half: every action can actually succeed. Scripted, so it is deterministic.
  function test_Handler_EveryActionSucceedsOnce() public {
    handler.recordLien(7, 250e6, 150, 30 days);
    handler.recordLien(8, 250e6, 150, 30 days);
    handler.rejectSubmission(9, 3);
    handler.releaseLien(0);
    handler.defaultLien(1);

    for (uint256 i; i < ghosts.exposedSelectorCount(); ++i) {
      bytes4 sel = ghosts.exposedSelector(i);
      assertGt(ghosts.callsBySelector(sel), 0, string.concat("a handler action can never succeed: ", vm.toString(sel)));
    }
  }

  /// @dev `expiresAt` of 1 so a mirrored default is never refused by the expiry guard. Nothing
  ///      the fuzzy lookup reads depends on it.
  function _mirror(
    CaplaneRegistry mirror,
    Forwarder f,
    uint256 nonce,
    uint8 kind,
    uint256 seed
  ) private {
    bytes memory report = _report(kind, nonce, seed);
    bytes memory m = f.metadata(OWNER, NAME);
    vm.prank(address(f));
    (bool ok,) = address(mirror).call(abi.encodeCall(mirror.onReport, (m, report)));
    assertTrue(ok, "the mirror refused a transition the live registry accepted");
  }

  function _report(
    uint8 kind,
    uint256 nonce,
    uint256 seed
  ) private view returns (bytes memory) {
    bytes32[] memory c = handler.tupleFor(seed);
    bytes32 id = keccak256(abi.encodePacked(c[0], c[1], c[2], c[3], c[4], c[5], c[6]));
    return Reports.body(kind, SELECTOR, bytes32(nonce), id, bytes32(0), address(0xB0110E1), 1, 0, 1, c);
  }
}
