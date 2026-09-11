// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Shadow accounting for the stateful suites.
/// @dev Three rules, written here because they are what separates an honest suite from a
///      decorative one:
///
///      1. Every value is written from what the handler passed in and what the call returned —
///         never by re-reading the contract under test. A ghost that reads what it checks is a
///         tautology that cannot fail.
///      2. A value is written only when the call succeeded. Reverts are counted separately, by
///         selector, so "nothing ran" is distinguishable from "everything held".
///      3. Every exposed handler action registers a counter, and an invariant fails if any of
///         them is still zero. A handler whose calls all revert otherwise produces a green run.
contract Ghosts {
  bytes32[] private _allLienIds;
  mapping(bytes32 lienId => bool) public known;
  mapping(bytes32 lienId => uint8) public lastSeenStatus;
  mapping(bytes32 lienId => uint256) public enteredActiveCount;

  uint256 public totalEverDisbursed;
  uint256 public totalEverRepaidPrincipal;
  uint256 public totalEverWrittenDown;
  uint256 public donatedToPool;
  uint256 public donatedToEscrow;
  uint256 public sumOfPaidFor;

  uint256 public lastPricePerShare;
  bool public lastActionWasUserFacing;

  bytes4[] private _exposed;
  mapping(bytes4 selector => uint256) public callsBySelector;
  mapping(bytes4 selector => uint256) public revertsBySelector;

  function expose(
    bytes4 selector
  ) external {
    _exposed.push(selector);
  }

  function exposedSelectorCount() external view returns (uint256) {
    return _exposed.length;
  }

  function exposedSelector(
    uint256 i
  ) external view returns (bytes4) {
    return _exposed[i];
  }

  function recordCall(
    bytes4 selector
  ) external {
    ++callsBySelector[selector];
  }

  /// @dev Clears the user-facing flag as well. The price invariant compares the current price
  ///      against the one recorded before the last action, so a stale `true` left behind by a
  ///      reverted call would compare across a loss that happened in between and fail for a
  ///      reason that is not a defect.
  function recordRevert(
    bytes4 selector
  ) external {
    ++revertsBySelector[selector];
    lastActionWasUserFacing = false;
  }

  function allLienIdsLength() external view returns (uint256) {
    return _allLienIds.length;
  }

  function allLienIds(
    uint256 i
  ) external view returns (bytes32) {
    return _allLienIds[i];
  }

  /// @dev Append-only, and deliberately so: summing over live liens would hide principal
  ///      stranded on a lien that left the live set, which is the defect this suite found.
  function noteLien(
    bytes32 lienId,
    uint8 status
  ) external {
    if (!known[lienId]) {
      known[lienId] = true;
      _allLienIds.push(lienId);
    }
    if (status == 1) ++enteredActiveCount[lienId];
    lastSeenStatus[lienId] = status;
  }

  function noteStatus(
    bytes32 lienId,
    uint8 status
  ) external {
    lastSeenStatus[lienId] = status;
  }

  function noteDisbursed(
    uint256 amount
  ) external {
    totalEverDisbursed += amount;
  }

  function noteRepaidPrincipal(
    uint256 amount
  ) external {
    totalEverRepaidPrincipal += amount;
  }

  function noteWrittenDown(
    uint256 amount
  ) external {
    totalEverWrittenDown += amount;
  }

  function noteDonatedToPool(
    uint256 amount
  ) external {
    donatedToPool += amount;
  }

  function noteDonatedToEscrow(
    uint256 amount
  ) external {
    donatedToEscrow += amount;
  }

  function notePaid(
    uint256 amount
  ) external {
    sumOfPaidFor += amount;
  }

  function noteHandedOn(
    uint256 amount
  ) external {
    sumOfPaidFor -= amount;
  }

  function notePrice(
    uint256 price,
    bool userFacing
  ) external {
    lastPricePerShare = price;
    lastActionWasUserFacing = userFacing;
  }
}
