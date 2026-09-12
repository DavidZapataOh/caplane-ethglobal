// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RegistryFixture} from "./support/RegistryFixture.sol";
import {Reports} from "./support/Reports.sol";

contract RegistryIndexTest is RegistryFixture {
  function _tuple(
    string memory debtor,
    string memory invoice,
    string memory bucket,
    string memory dueDate
  ) internal pure returns (bytes32[7] memory t) {
    t[0] = keccak256(abi.encodePacked(uint8(0), debtor));
    t[1] = keccak256(abi.encodePacked(uint8(1), invoice));
    t[2] = keccak256(abi.encodePacked(uint8(2), bucket));
    t[3] = keccak256(abi.encodePacked(uint8(3), dueDate));
    t[4] = keccak256(abi.encodePacked(uint8(4), "AUD"));
    t[5] = keccak256(abi.encodePacked(uint8(5), "ISSUER"));
    t[6] = keccak256(abi.encodePacked(uint8(6), "AU"));
  }

  function _lienId(
    bytes32[7] memory t
  ) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(t[0], t[1], t[2], t[3], t[4], t[5], t[6]));
  }

  function _query(
    bytes32[7] memory t
  ) internal pure returns (bytes32[] memory q) {
    q = new bytes32[](7);
    for (uint256 i; i < 7; ++i) {
      q[i] = t[i];
    }
  }

  function _recordTuple(
    bytes32[7] memory t
  ) internal {
    _send(Reports.body(1, SELECTOR, _next(), _lienId(t), SUBMISSION_1, BORROWER, 250_000_000, 150, EXPIRES, _query(t)));
  }

  /// @dev Seven stored, three indexed. Scoring only the indexed three would return 3 here.
  function test_MatchesOf_ScoresAllSevenThoughItIndexesThree() public {
    bytes32[7] memory stored = _tuple("DEBTOR", "INV-1", "BUCKET-15", "2026-12-31");
    _recordTuple(stored);

    bytes32[] memory query = _query(stored);
    query[2] = keccak256("BUCKET-16"); // the unindexed component differs

    (bytes32 lienId, uint8 matched) = registry.matchesOf(query);
    assertEq(lienId, _lienId(stored));
    assertEq(matched, 6, "the amount bucket must still count against the threshold");
  }

  function test_MatchesOf_FindsACandidateThroughEachIndexedComponent() public {
    bytes32[7] memory stored = _tuple("DEBTOR", "INV-1", "BUCKET-15", "2026-12-31");
    _recordTuple(stored);

    uint256[3] memory positions = [uint256(0), 1, 3];
    for (uint256 i; i < 3; ++i) {
      bytes32[] memory query = _fresh();
      query[positions[i]] = stored[positions[i]];
      (bytes32 lienId,) = registry.matchesOf(query);
      assertEq(lienId, _lienId(stored), "not reachable through an indexed component");
    }
  }

  /// @dev The amount bucket is not a way in. Indexing position 2 makes this return matched 1.
  function test_MatchesOf_DoesNotIndexTheAmountBucket() public {
    bytes32[7] memory stored = _tuple("DEBTOR", "INV-1", "BUCKET-15", "2026-12-31");
    _recordTuple(stored);

    bytes32[] memory query = _fresh();
    query[2] = stored[2]; // only the bucket agrees

    (bytes32 lienId, uint8 matched) = registry.matchesOf(query);
    assertEq(lienId, bytes32(0));
    assertEq(matched, 0);
  }

  /// @dev Two nodes running the same eth_call must agree. The fixture asserts its own premise:
  ///      without that, changing an invoice number silently turns this test vacuous.
  function test_MatchesOf_BreaksTiesByTheLowerLienId() public {
    bytes32[7] memory first = _tuple("DEBTOR", "INV-1", "BUCKET-15", "2026-12-31");
    bytes32[7] memory second = _tuple("DEBTOR", "INV-2", "BUCKET-15", "2026-12-31");
    assertLt(uint256(_lienId(second)), uint256(_lienId(first)), "fixture must insert the higher id first");

    _recordTuple(first);
    _recordTuple(second);

    bytes32[] memory query = _query(first);
    query[1] = keccak256("INV-3"); // agrees with both on six, with neither on seven

    (bytes32 lienId, uint8 matched) = registry.matchesOf(query);
    assertEq(matched, 6);
    assertEq(lienId, _lienId(second), "a first-seen implementation returns the other one");
  }

  function test_MatchesOf_SkipsLiensThatAreNoLongerActive() public {
    bytes32[7] memory stored = _tuple("DEBTOR", "INV-1", "BUCKET-15", "2026-12-31");
    _recordTuple(stored);
    _release(_lienId(stored));

    (bytes32 lienId, uint8 matched) = registry.matchesOf(_query(stored));
    assertEq(lienId, bytes32(0));
    assertEq(matched, 0);
  }

  /// @dev A lien reachable through three indexed components is scored three times, deliberately:
  ///      EIP-2929 makes the repeats warm, while a memory dedupe is O(C-squared).
  function test_MatchesOf_IsIdempotentUnderDuplicateCandidacy() public {
    bytes32[7] memory stored = _tuple("DEBTOR", "INV-1", "BUCKET-15", "2026-12-31");
    _recordTuple(stored);
    (, uint8 matched) = registry.matchesOf(_query(stored));
    assertEq(matched, 7);
  }

  function test_MatchesOf_ReturnsZeroForAClaimSharingNothing() public {
    _recordTuple(_tuple("DEBTOR", "INV-1", "BUCKET-15", "2026-12-31"));
    (bytes32 lienId, uint8 matched) = registry.matchesOf(_fresh());
    assertEq(lienId, bytes32(0));
    assertEq(matched, 0);
  }

  /// @dev A short query must not Panic: it is a permissionless view and anyone can call it.
  function test_MatchesOf_ReturnsZeroForAMalformedQuery() public {
    _recordTuple(_tuple("DEBTOR", "INV-1", "BUCKET-15", "2026-12-31"));
    (bytes32 lienId, uint8 matched) = registry.matchesOf(new bytes32[](6));
    assertEq(lienId, bytes32(0));
    assertEq(matched, 0);
  }

  function _populate(
    uint256 from,
    uint256 to
  ) private {
    for (uint256 i = from; i < to; ++i) {
      _recordTuple(
        _tuple(
          string.concat("DEBTOR-", vm.toString(i / 2)),
          string.concat("INV-", vm.toString(i)),
          i % 100 < 44 ? "BUCKET-15" : string.concat("BUCKET-", vm.toString(13 + (i % 7))),
          string.concat("DUE-", vm.toString(i / 2))
        )
      );
    }
  }

  /// @dev Cooled first. A populated registry leaves every slot warm, and a remote `eth_call`
  ///      never arrives warm: measuring without this reports a fraction of the real cost and can
  ///      even make a larger registry look cheaper than a small one.
  function _measureMatchesOf() private returns (uint256) {
    bytes32[] memory query = _query(_tuple("DEBTOR-1", "INV-9999", "BUCKET-15", "DUE-1"));
    vm.cool(address(registry));
    uint256 before = gasleft();
    registry.matchesOf(query);
    return before - gasleft();
  }

  /// @dev The whole point of indexing three rather than four: the walk must not grow with the
  ///      registry. The populator takes a range because populating twice from zero would repeat
  ///      lien ids and revert, which is exactly what would stop the measurement happening.
  function test_MatchesOf_CostDoesNotGrowWithTheRegistry() public {
    _populate(0, 43);
    uint256 small = _measureMatchesOf();

    _populate(43, 1000);
    uint256 large = _measureMatchesOf();

    emit log_named_uint("matchesOf at 43 liens", small);
    emit log_named_uint("matchesOf at 1000 liens", large);
    assertLt(large, (small * 12) / 10, "the walk is growing with the registry");
    assertLt(large, 150_000, "matchesOf must stay far under the node call cap");
  }

  /// @dev The flat cost above is flat in REGISTRY SIZE. It is not flat in how many liens share
  ///      one debtor and one due date, and nothing bounds that: a single client with two hundred
  ///      invoices is an ordinary factoring relationship. This measures the edge rather than
  ///      leaving it to be discovered, and asserts only that it stays inside the node's cap.
  function test_MatchesOf_CostGrowsWithPostingListDensity() public {
    bytes32[7] memory shape;
    for (uint256 i; i < 200; ++i) {
      shape = _tuple("ONE-DEBTOR", string.concat("INV-", vm.toString(i)), "BUCKET-15", "ONE-DUE");
      _recordTuple(shape);
    }

    bytes32[] memory query = _query(shape);
    vm.cool(address(registry));
    uint256 before = gasleft();
    registry.matchesOf(query);
    uint256 spent = before - gasleft();

    emit log_named_uint("matchesOf with 200 liens on one debtor and one due date", spent);
    assertLt(spent, 30_000_000, "past the call cap observed on Arc's primary endpoint");
  }

  /// @dev Pinned near the measured value, not at the ceiling: an assertion at 4,800,000 would
  ///      pass through a tenfold regression. The bound is the receipt figure, so it binds under
  ///      `--isolate`, where this reads 458,261; the default run measures 428,571 because
  ///      execution gas charges no intrinsic cost and no calldata.
  function test_OnReport_StaysNearItsMeasuredCost() public {
    uint256 before = gasleft();
    _record(LIEN_A, 250_000_000, 150, EXPIRES);
    uint256 spent = before - gasleft();
    emit log_named_uint("onReport Record", spent);
    // Raised from 470,000 when closing became O(1). Recording now writes three extra slots — the
    // position of the lien inside each of its three posting lists — which costs about 67,000 gas
    // and buys the removal of an unbounded term.
    //
    // The alternative was to scan each posting list at close time and keep recording cheap. That
    // moves the cost, it does not remove it, and it moves it the wrong way: `matchesOf` is a view
    // reached by `eth_call`, bounded by a node cap and paid by nobody, while `_close` is a real
    // transaction bounded by 10,000,000. A linear scan over three lists of a thousand liens is
    // roughly 6,300,000 gas, so closing would start failing before querying did — and a lien that
    // cannot be closed is permanently encumbered, which is the defect this whole change exists to
    // remove. A fixed 5% of the transaction budget in exchange for that is the right trade, and it
    // is written here rather than argued in a commit message.
    assertLt(spent, 520_000, "record cost regressed");
    assertLt(spent, 4_800_000, "past the transaction budget");
  }
}
