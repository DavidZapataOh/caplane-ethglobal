// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplaneEscrow} from "../../src/CaplaneEscrow.sol";
import {CaplanePool} from "../../src/CaplanePool.sol";
import {CaplaneRegistry} from "../../src/CaplaneRegistry.sol";
import {ICaplaneRegistry} from "../../src/interfaces/ICaplaneRegistry.sol";
import {Forwarder} from "../support/Forwarder.sol";
import {Reports} from "../support/Reports.sol";
import {Ghosts} from "./Ghosts.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Drives the registry through its only write path: a signed report from the forwarder.
/// @dev Two bounds here are not tuning and their absence produces a false finding. `block.number`
///      never reaches zero and no call is ever pranked from the zero address, because the two
///      sentinel guards in this system — the inbox's duplicate check on `submitter != address(0)`
///      and the pool's `fundedAt != 0` — both open in exactly those states, and production can
///      reach neither. Without the bounds the fuzzer hands back a "double disbursement" that is
///      not one.
contract RegistryHandler is Test {
  CaplaneRegistry public immutable REGISTRY;
  Forwarder public immutable FORWARDER;
  Ghosts public immutable GHOSTS;

  address internal immutable OWNER;
  bytes10 internal immutable NAME;
  uint64 internal immutable SELECTOR;

  bytes32[] internal _recorded;
  /// @dev The seed each recorded lien was built from. `_tuple` is deterministic, so this is
  ///      enough to replay the whole population into a second registry in a different order,
  ///      which is how order independence is checked once per run in `afterInvariant`.
  uint256[] public recordedSeeds;
  uint256 internal _seq;

  constructor(
    CaplaneRegistry registry,
    Forwarder forwarder,
    Ghosts ghosts,
    // the zero check is the first line of the body; forge-lint does not recognise that form. A
    // zero owner builds metadata the registry can never accept, so every write would revert and
    // the suite would pass having recorded nothing.
    // forge-lint: disable-next-line(missing-zero-check)
    address owner,
    bytes10 name,
    uint64 selector
  ) {
    if (owner == address(0)) revert("workflow owner is the zero address");
    REGISTRY = registry;
    FORWARDER = forwarder;
    GHOSTS = ghosts;
    OWNER = owner;
    NAME = name;
    SELECTOR = selector;
    ghosts.expose(this.recordLien.selector);
    ghosts.expose(this.releaseLien.selector);
    ghosts.expose(this.defaultLien.selector);
    ghosts.expose(this.rejectSubmission.selector);
  }

  function recordedLength() external view returns (uint256) {
    return _recorded.length;
  }

  function recordedLien(
    uint256 i
  ) external view returns (bytes32) {
    return _recorded[i];
  }

  function tupleFor(
    uint256 seed
  ) external pure returns (bytes32[] memory) {
    return _tuple(seed);
  }

  function _next() internal returns (bytes32) {
    unchecked {
      return bytes32(++_seq);
    }
  }

  /// @dev Component values are drawn from a small pool so posting lists actually collide.
  ///      Random 32-byte commitments give a registry where nothing ever matches and the fuzzy
  ///      lookup is never exercised at all.
  function _tuple(
    uint256 seed
  ) internal pure returns (bytes32[] memory c) {
    c = new bytes32[](7);
    c[0] = keccak256(abi.encodePacked(uint8(0), seed % 5));
    c[1] = keccak256(abi.encodePacked(uint8(1), seed));
    c[2] = keccak256(abi.encodePacked(uint8(2), seed % 3));
    c[3] = keccak256(abi.encodePacked(uint8(3), seed % 4));
    c[4] = keccak256(abi.encodePacked(uint8(4), "AUD"));
    c[5] = keccak256(abi.encodePacked(uint8(5), "ISSUER"));
    c[6] = keccak256(abi.encodePacked(uint8(6), "AU"));
  }

  function _send(
    bytes memory report
  ) internal returns (bool ok) {
    bytes memory m = FORWARDER.metadata(OWNER, NAME);
    vm.prank(address(FORWARDER));
    (ok,) = address(REGISTRY).call(abi.encodeCall(REGISTRY.onReport, (m, report)));
  }

  function _pick(
    uint256 seed
  ) internal view returns (bytes32) {
    if (_recorded.length == 0) return bytes32(0);
    return _recorded[seed % _recorded.length];
  }

  function recordLien(
    uint256 seed,
    uint128 advance,
    uint32 rateBps,
    uint256 term
  ) external {
    advance = uint128(bound(advance, 0, 1000e6)); // zero included: disburse must refuse it
    rateBps = uint32(bound(rateBps, 0, 10_000));
    uint64 expiresAt = uint64(block.timestamp + bound(term, 1, 365 days));

    bytes32[] memory c = _tuple(seed);
    bytes32 lienId = keccak256(abi.encodePacked(c[0], c[1], c[2], c[3], c[4], c[5], c[6]));
    bool ok = _send(
      Reports.body(
        1,
        SELECTOR,
        _next(),
        lienId,
        keccak256(abi.encodePacked("sub", seed)),
        address(uint160(0xB0110E1 + (seed % 3))),
        advance,
        rateBps,
        expiresAt,
        c
      )
    );

    if (!ok) return GHOSTS.recordRevert(this.recordLien.selector);
    _recorded.push(lienId);
    recordedSeeds.push(seed);
    GHOSTS.noteLien(lienId, 1);
    GHOSTS.recordCall(this.recordLien.selector);
  }

  function releaseLien(
    uint256 seed
  ) external {
    bytes32 lienId = _pick(seed);
    bool ok = _send(Reports.body(2, SELECTOR, _next(), lienId, bytes32(0), address(0), 0, 0, 0, _tuple(seed)));
    if (!ok) return GHOSTS.recordRevert(this.releaseLien.selector);
    GHOSTS.noteStatus(lienId, 2);
    GHOSTS.recordCall(this.releaseLien.selector);
  }

  /// @dev Warps forward first or every call dies on the registry's expiry guard and the branch
  ///      gets no coverage at all. Forward only — never backward.
  function defaultLien(
    uint256 seed
  ) external {
    bytes32 lienId = _pick(seed);
    uint64 expiresAt = REGISTRY.lienOf(lienId).expiresAt;
    // comparing against `block.timestamp` is intended here: the harness drives the clock to the
    // expiry the registry demands. Without it every default dies on that guard and the branch
    // gets no coverage at all. Forward only, never backward.
    // forge-lint: disable-next-line(block-timestamp)
    if (expiresAt > block.timestamp) vm.warp(expiresAt);

    bool ok = _send(Reports.body(3, SELECTOR, _next(), lienId, bytes32(0), address(0), 0, 0, 0, _tuple(seed)));
    if (!ok) return GHOSTS.recordRevert(this.defaultLien.selector);
    GHOSTS.noteStatus(lienId, 3);
    GHOSTS.recordCall(this.defaultLien.selector);
  }

  function rejectSubmission(
    uint256 seed,
    uint32 reason
  ) external {
    reason = uint32(bound(reason, 0, 255));
    bool ok = _send(
      Reports.body(
        4,
        SELECTOR,
        _next(),
        bytes32(0),
        keccak256(abi.encodePacked("sub", seed)),
        address(0),
        0,
        reason,
        0,
        _tuple(seed)
      )
    );
    if (!ok) return GHOSTS.recordRevert(this.rejectSubmission.selector);
    GHOSTS.recordCall(this.rejectSubmission.selector);
  }
}

/// @notice Everything the registry handler does, plus the money. This is the only handler that
///         can produce sequences crossing the registry/pool/escrow boundary, which is where the
///         defects this suite found actually lived.
contract SystemHandler is RegistryHandler {
  IERC20 public immutable USDC;
  CaplanePool public immutable POOL;
  CaplaneEscrow public immutable ESCROW;

  // Never a low address: 0x1 is the ecrecover precompile and holds most of the testnet supply.
  address public immutable INVESTOR = address(uint160(uint256(keccak256("caplane.invariant.investor"))));
  address public immutable DEBTOR = address(uint160(uint256(keccak256("caplane.invariant.debtor"))));

  constructor(
    CaplaneRegistry registry,
    Forwarder forwarder,
    Ghosts ghosts,
    address owner,
    bytes10 name,
    uint64 selector,
    CaplanePool pool,
    CaplaneEscrow escrow,
    IERC20 usdc
  ) RegistryHandler(registry, forwarder, ghosts, owner, name, selector) {
    POOL = pool;
    ESCROW = escrow;
    USDC = usdc;
    ghosts.expose(this.deposit.selector);
    ghosts.expose(this.redeem.selector);
    ghosts.expose(this.disburse.selector);
    ghosts.expose(this.repay.selector);
    ghosts.expose(this.writeDown.selector);
    ghosts.expose(this.pay.selector);
    ghosts.expose(this.settle.selector);
    ghosts.expose(this.refund.selector);
    ghosts.expose(this.donateToPool.selector);
    ghosts.expose(this.donateToEscrow.selector);
  }

  /// @dev The only way to fund on this chain: the ERC-20 balance IS the native balance over 1e12.
  function _fund(
    address who,
    uint256 usdc6
  ) internal {
    vm.deal(who, who.balance + usdc6 * 1e12);
  }

  function _price() internal view returns (uint256) {
    return POOL.convertToAssets(1e18);
  }

  function deposit(
    uint256 assets
  ) external {
    assets = bound(assets, 1, 200e6);
    uint256 before = _price();
    _fund(INVESTOR, assets);
    vm.startPrank(INVESTOR);
    USDC.approve(address(POOL), type(uint256).max);
    (bool ok,) = address(POOL).call(abi.encodeCall(POOL.deposit, (assets, INVESTOR)));
    vm.stopPrank();
    if (!ok) return GHOSTS.recordRevert(this.deposit.selector);
    GHOSTS.notePrice(before, true);
    GHOSTS.recordCall(this.deposit.selector);
  }

  function redeem(
    uint256 shares
  ) external {
    uint256 cap = POOL.maxRedeem(INVESTOR);
    if (cap == 0) return GHOSTS.recordRevert(this.redeem.selector);
    shares = bound(shares, 1, cap);
    uint256 before = _price();
    vm.prank(INVESTOR);
    (bool ok,) = address(POOL).call(abi.encodeCall(POOL.redeem, (shares, INVESTOR, INVESTOR)));
    if (!ok) return GHOSTS.recordRevert(this.redeem.selector);
    GHOSTS.notePrice(before, true);
    GHOSTS.recordCall(this.redeem.selector);
  }

  function disburse(
    uint256 seed
  ) external {
    bytes32 lienId = _pick(seed);
    uint256 before = _price();
    uint128 advance = REGISTRY.lienOf(lienId).advanceUsdc6;
    (bool ok,) = address(POOL).call(abi.encodeCall(POOL.disburse, (lienId)));
    if (!ok) return GHOSTS.recordRevert(this.disburse.selector);
    GHOSTS.noteDisbursed(advance);
    GHOSTS.notePrice(before, false);
    GHOSTS.recordCall(this.disburse.selector);
  }

  function repay(
    uint256 seed
  ) external {
    bytes32 lienId = _pick(seed);
    uint256 principal = POOL.principalOf(lienId);
    uint256 before = _price();
    _fund(DEBTOR, 5000e6);
    vm.startPrank(DEBTOR);
    USDC.approve(address(POOL), type(uint256).max);
    (bool ok,) = address(POOL).call(abi.encodeCall(POOL.repay, (lienId)));
    vm.stopPrank();
    if (!ok) return GHOSTS.recordRevert(this.repay.selector);
    GHOSTS.noteRepaidPrincipal(principal);
    GHOSTS.notePrice(before, false);
    GHOSTS.recordCall(this.repay.selector);
  }

  function writeDown(
    uint256 seed
  ) external {
    bytes32 lienId = _pick(seed);
    uint256 principal = POOL.principalOf(lienId);
    uint256 before = _price();
    (bool ok,) = address(POOL).call(abi.encodeCall(POOL.writeDown, (lienId)));
    if (!ok) return GHOSTS.recordRevert(this.writeDown.selector);
    GHOSTS.noteWrittenDown(principal);
    GHOSTS.notePrice(before, false);
    GHOSTS.recordCall(this.writeDown.selector);
  }

  function pay(
    uint256 seed,
    uint256 amount
  ) external {
    bytes32 lienId = _pick(seed);
    amount = bound(amount, 1, 500e6);
    uint256 before = _price();
    _fund(DEBTOR, amount);
    vm.startPrank(DEBTOR);
    USDC.approve(address(ESCROW), type(uint256).max);
    (bool ok,) = address(ESCROW).call(abi.encodeCall(ESCROW.pay, (lienId, amount)));
    vm.stopPrank();
    if (!ok) return GHOSTS.recordRevert(this.pay.selector);
    GHOSTS.notePaid(amount);
    GHOSTS.notePrice(before, false);
    GHOSTS.recordCall(this.pay.selector);
  }

  function settle(
    uint256 seed
  ) external {
    bytes32 lienId = _pick(seed);
    uint256 held = ESCROW.paidFor(lienId);
    uint256 principal = POOL.principalOf(lienId);
    uint256 before = _price();
    (bool ok,) = address(ESCROW).call(abi.encodeCall(ESCROW.settle, (lienId)));
    if (!ok) return GHOSTS.recordRevert(this.settle.selector);
    GHOSTS.noteHandedOn(held);
    GHOSTS.noteRepaidPrincipal(principal);
    GHOSTS.notePrice(before, false);
    GHOSTS.recordCall(this.settle.selector);
  }

  function refund(
    uint256 seed
  ) external {
    bytes32 lienId = _pick(seed);
    uint256 owed = ESCROW.paidBy(lienId, DEBTOR);
    uint256 before = _price();
    vm.prank(DEBTOR);
    (bool ok,) = address(ESCROW).call(abi.encodeCall(ESCROW.refund, (lienId)));
    if (!ok) return GHOSTS.recordRevert(this.refund.selector);
    GHOSTS.noteHandedOn(owed);
    GHOSTS.notePrice(before, false);
    GHOSTS.recordCall(this.refund.selector);
  }

  /// @dev Anyone can push USDC at either contract and nothing refuses it. Exercised on purpose:
  ///      the accounting invariants are inequalities for this reason, and the gap between what
  ///      is held and what is attributed has to be explained rather than tolerated.
  function donateToPool(
    uint256 amount
  ) external {
    amount = bound(amount, 1, 10e6);
    _fund(DEBTOR, amount);
    vm.prank(DEBTOR);
    // Checked: a donation that silently failed would leave the accounting invariants comparing
    // a balance that never moved against a ghost that says it did, and they would pass.
    require(USDC.transfer(address(POOL), amount), "the donation did not land");
    GHOSTS.noteDonatedToPool(amount);
    GHOSTS.notePrice(_price(), false);
    GHOSTS.recordCall(this.donateToPool.selector);
  }

  function donateToEscrow(
    uint256 amount
  ) external {
    amount = bound(amount, 1, 10e6);
    _fund(DEBTOR, amount);
    vm.prank(DEBTOR);
    require(USDC.transfer(address(ESCROW), amount), "the donation did not land");
    GHOSTS.noteDonatedToEscrow(amount);
    GHOSTS.notePrice(_price(), false);
    GHOSTS.recordCall(this.donateToEscrow.selector);
  }
}
