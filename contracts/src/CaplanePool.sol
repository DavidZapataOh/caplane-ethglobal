// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ICaplaneRegistry} from "./interfaces/ICaplaneRegistry.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice The investors' capital. Deposits and redemptions follow ERC-4626; advances leave and
///         return through functions anyone may call, authorised by what the registry says about
///         a lien rather than by who is calling. There is no owner, no pause and no setter.
contract CaplanePool is ERC4626 {
  event Disbursed(bytes32 indexed lienId, address indexed borrower, uint256 amount);
  event Repaid(bytes32 indexed lienId, address indexed payer, uint256 amount);
  event WrittenDown(bytes32 indexed lienId, uint256 principal);

  error AlreadyDisbursed(bytes32 lienId);
  error LienNotFundable(bytes32 lienId);
  error NotDisbursed(bytes32 lienId);
  error AlreadySettled(bytes32 lienId);
  error LienNotRepayable(bytes32 lienId);
  error LienNotDefaulted(bytes32 lienId);

  uint256 private constant BPS = 10_000;

  ICaplaneRegistry public immutable REGISTRY;

  struct Advance {
    uint128 principal;
    uint64 fundedAt;
  }

  uint256 private _outstanding;

  /// @dev One word per advance. These were two mappings on the same key, which cost a second
  ///      cold slot on every disbursement.
  mapping(bytes32 lienId => Advance) private _advances;

  /// @notice Block in which an advance was funded, or zero if it never was.
  function fundedAt(
    bytes32 lienId
  ) public view returns (uint256) {
    return _advances[lienId].fundedAt;
  }

  constructor(
    IERC20 asset_,
    ICaplaneRegistry registry
  ) ERC4626(asset_) ERC20("Caplane Pool Share", "cpUSDC") {
    REGISTRY = registry;
  }

  /// @dev Twelve, over a six-decimal asset, so shares are eighteen-decimal. This is the entire
  ///      defence against the first-depositor attack, and on this chain that attack is cheaper
  ///      than elsewhere: the asset's `balanceOf` is the account's native balance divided by
  ///      1e12, so a plain value transfer inflates it for the price of a bare send. The vault
  ///      has no `receive()` for the same reason.
  function _decimalsOffset() internal pure override returns (uint8) {
    return 12;
  }

  /// @notice Pay an active lien's borrower out of the pool. Anyone may call it: what authorises
  ///         the payment is the registry's record, never the caller.
  function disburse(
    bytes32 lienId
  ) external {
    if (_advances[lienId].fundedAt != 0) revert AlreadyDisbursed(lienId);

    ICaplaneRegistry.Lien memory lien = REGISTRY.lienOf(lienId);
    if (lien.status != 1) revert LienNotFundable(lienId);
    // A zero advance would mark the lien funded while leaving nothing to repay or write down,
    // and it could never be settled again.
    if (lien.advanceUsdc6 == 0) revert LienNotFundable(lienId);

    // uint64 of block number: at half a second a block, longer than the sun has left.
    _advances[lienId] = Advance({principal: lien.advanceUsdc6, fundedAt: uint64(block.number)});
    _outstanding += lien.advanceUsdc6;

    SafeERC20.safeTransfer(IERC20(asset()), lien.borrower, lien.advanceUsdc6);
    emit Disbursed(lienId, lien.borrower, lien.advanceUsdc6);
  }

  function outstandingPrincipal() public view returns (uint256) {
    return _outstanding;
  }

  /// @notice Principal still out on one advance, or zero once it is repaid or written down.
  /// @dev Public because the registry enumerates nothing: summing this over every lien ever
  ///      recorded is the only way anyone — an auditor, a test, an indexer — can check that the
  ///      aggregate above is not drifting from its parts.
  function principalOf(
    bytes32 lienId
  ) public view returns (uint256) {
    return _advances[lienId].principal;
  }

  /// @dev Idle cash plus capital that is out on advances. A pure internal counter would strand
  ///      repayments, which arrive as plain transfers from a payer who never calls this vault.
  function totalAssets() public view override returns (uint256) {
    return IERC20(asset()).balanceOf(address(this)) + _outstanding;
  }

  /// @dev Cap by what is actually payable today. ERC-4626 requires the advertised maximum never
  ///      to exceed what would succeed, and requires this never to revert. `maxWithdraw` derives
  ///      from this one, so both are capped by capping here.
  function maxRedeem(
    address owner
  ) public view override returns (uint256) {
    uint256 liquid = convertToShares(IERC20(asset()).balanceOf(address(this)));
    uint256 held = balanceOf(owner);
    return held < liquid ? held : liquid;
  }

  /// @notice What settles an advance: the advance plus a flat fee over the term.
  /// @dev `rateBps` is documented against face value, which never reaches the chain — the
  ///      claim's amount lives inside a peppered commitment. The advance is what the chain has,
  ///      so the advance is what it charges. The division truncates, so a one-unit advance at
  ///      one basis point carries no fee at all.
  function amountDue(
    bytes32 lienId
  ) public view returns (uint256) {
    ICaplaneRegistry.Lien memory lien = REGISTRY.lienOf(lienId);
    return lien.advanceUsdc6 + (uint256(lien.advanceUsdc6) * lien.rateBps) / BPS;
  }

  /// @notice Settle an advance. Anyone may pay; the payer is charged, the pool is credited.
  function repay(
    bytes32 lienId
  ) external {
    if (_advances[lienId].fundedAt == 0) revert NotDisbursed(lienId);
    uint256 principal = _advances[lienId].principal;
    if (principal == 0) revert AlreadySettled(lienId);
    // Every function here obeys the registry, and this one is no exception: a released or
    // defaulted lien is not repayable.
    if (REGISTRY.statusOf(lienId) != 1) revert LienNotRepayable(lienId);

    uint256 due = amountDue(lienId);

    // Books first, then money. Mid-transfer the vault would otherwise hold the repayment AND
    // still count the principal it repays, so `totalAssets` spikes rather than dips and a
    // reentrant redemption would exit at an inflated price. Arc's token moves through a
    // precompile and calls no hook today, so this is latent — but the ordering is also cheaper,
    // so there is nothing to trade.
    _advances[lienId].principal = 0;
    _outstanding -= principal;

    SafeERC20.safeTransferFrom(IERC20(asset()), msg.sender, address(this), due);
    emit Repaid(lienId, msg.sender, due);
  }

  /// @notice Realise the loss on a defaulted advance. Anyone may call it: what authorises the
  ///         write-down is the registry's status, which only a signed report sets and only
  ///         after the term has passed.
  function writeDown(
    bytes32 lienId
  ) external {
    if (_advances[lienId].fundedAt == 0) revert NotDisbursed(lienId);
    uint256 principal = _advances[lienId].principal;
    if (principal == 0) revert AlreadySettled(lienId);
    // Any terminal status, not only `defaulted`. A lien released without being repaid would
    // otherwise strand its principal in `_outstanding` for ever, permanently over-reporting what
    // the vault is worth and handing the loss to whoever redeems last. Reaching a terminal
    // status still requires a signed report, and a lien that really was repaid already has no
    // principal left, so it hits `AlreadySettled` before this line.
    if (REGISTRY.statusOf(lienId) == 1) revert LienNotDefaulted(lienId);

    _advances[lienId].principal = 0;
    _outstanding -= principal;
    emit WrittenDown(lienId, principal);
  }
}
