// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplanePool} from "./CaplanePool.sol";
import {ICaplaneRegistry} from "./interfaces/ICaplaneRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Where a debtor pays. Payments accumulate against one lien and are settled by anyone
///         once they cover what the pool is owed: the pool takes the advance and its fee, the
///         rest goes back to the business. No owner, no pause, no discretion — and money is
///         only accepted while a way out of this contract still exists.
contract CaplaneEscrow {
  event Paid(bytes32 indexed lienId, address indexed payer, uint256 amount);
  event Settled(bytes32 indexed lienId, uint256 toPool, uint256 toBorrower);
  event Refunded(bytes32 indexed lienId, address indexed payer, uint256 amount);

  error LienNotPayable(bytes32 lienId, uint8 status);
  error NothingToPay(bytes32 lienId);
  error AlreadySettled(bytes32 lienId);
  error Misconfigured();
  error NotYetCovered(bytes32 lienId, uint256 paid, uint256 due);
  error StillSettleable(bytes32 lienId);
  error NothingToRefund(bytes32 lienId, address payer);

  IERC20 public immutable USDC;
  ICaplaneRegistry public immutable REGISTRY;
  CaplanePool public immutable POOL;

  struct Payment {
    uint248 paid;
    bool settled;
  }

  /// @dev One word per lien. The running total and the settled flag were two mappings on the
  ///      same key, which cost a second cold slot on every settlement for one bit.
  mapping(bytes32 lienId => Payment) private _payments;

  /// @notice What one payer put towards one lien, so it can be handed back to them and to
  ///         nobody else if settlement becomes impossible after they paid.
  mapping(bytes32 lienId => mapping(address payer => uint256 amount)) public paidBy;

  /// @notice Total paid towards a lien and not yet handed on.
  function paidFor(
    bytes32 lienId
  ) public view returns (uint256) {
    return _payments[lienId].paid;
  }

  /// @notice Whether a lien has been settled. The registry has no field for it, so it is
  ///         recorded here or a later payment would be accepted against a lien that can no
  ///         longer be settled.
  function settled(
    bytes32 lienId
  ) public view returns (bool) {
    return _payments[lienId].settled;
  }

  constructor(
    IERC20 usdc,
    ICaplaneRegistry registry,
    CaplanePool pool
  ) {
    if (pool.asset() != address(usdc) || address(pool.REGISTRY()) != address(registry)) {
      revert Misconfigured();
    }
    USDC = usdc;
    REGISTRY = registry;
    POOL = pool;
  }

  /// @notice Pay towards a lien, in one payment or several. Anyone may pay: in factoring the
  ///         payer is the debtor, who owes the invoice, not the business that financed it.
  /// @dev Only an active, unsettled lien is accepted. Settlement is this contract's only way to
  ///      pass money on, and it requires both, so anything else would take money whose only
  ///      remaining path is back out the way it came.
  function pay(
    bytes32 lienId,
    uint256 amount
  ) external {
    if (amount == 0) revert NothingToPay(lienId);
    if (_payments[lienId].settled) revert AlreadySettled(lienId);

    uint8 status = REGISTRY.statusOf(lienId);
    if (status != 1) revert LienNotPayable(lienId, status);

    // casting to 'uint248' is safe because USDC's entire supply is about 1e16 base units
    // against a 2**248 ceiling, and this contract can only hold what was transferred into it.
    // It is still a narrowing where there was none, which is why it is named.
    // forge-lint: disable-next-line(unsafe-typecast)
    _payments[lienId].paid += uint248(amount);
    paidBy[lienId][msg.sender] += amount;
    SafeERC20.safeTransferFrom(USDC, msg.sender, address(this), amount);
    emit Paid(lienId, msg.sender, amount);
  }

  /// @notice Close an advance once the payments cover it. Anyone may call this: what authorises
  ///         it is the arithmetic, not the caller.
  function settle(
    bytes32 lienId
  ) external {
    if (_payments[lienId].settled) revert AlreadySettled(lienId);

    uint256 paid = _payments[lienId].paid;
    uint256 due = POOL.amountDue(lienId);
    if (paid < due) revert NotYetCovered(lienId, paid, due);

    address borrower = REGISTRY.lienOf(lienId).borrower;
    uint256 surplus = paid - due;

    _payments[lienId] = Payment({paid: 0, settled: true});

    SafeERC20.forceApprove(USDC, address(POOL), due);
    POOL.repay(lienId);
    SafeERC20.forceApprove(USDC, address(POOL), 0);

    if (surplus != 0) SafeERC20.safeTransfer(USDC, borrower, surplus);
    emit Settled(lienId, due, surplus);
  }

  /// @notice Take back what you paid, once this lien can never be settled.
  /// @dev Payment is refused unless a lien is active and unsettled, but three legitimate things
  ///      close that exit after the money is already inside: a default report, a release report,
  ///      and the borrower calling the pool's permissionless `repay` themselves. Each leaves a
  ///      partial payment with nowhere to go, and none of them requires anybody to misbehave.
  ///
  ///      This is not the `recover` shape that was considered and rejected. It moves a payer's
  ///      own money back to that payer: it never touches the vault's assets, so it cannot be
  ///      sequenced against a write-down to inflate the share price, and it can never pay out an
  ///      advance the vault did not make.
  function refund(
    bytes32 lienId
  ) external {
    // Settlement pays everything out but cannot clear each payer's record — there is no way to
    // enumerate payers — so those records outlive the money. Checked arithmetic would already
    // stop the second withdrawal, since `paidFor` is zero by then and the subtraction below
    // underflows; this says why instead of panicking, and does not leave a money-safety property
    // resting on a line whose purpose is bookkeeping.
    if (_payments[lienId].settled) revert AlreadySettled(lienId);

    uint256 amount = paidBy[lienId][msg.sender];
    if (amount == 0) revert NothingToRefund(lienId, msg.sender);

    // Keyed on the debt, not on whether `settle` happens to be callable right now. Asking the
    // latter meant a terminal report closed the pool's claim on this cash and opened the payer's
    // claim on it in the same instant — mirror-image guards, with no ordering in which the money
    // reached the advance it was paid against.
    if (POOL.principalOf(lienId) != 0) revert StillSettleable(lienId);

    paidBy[lienId][msg.sender] = 0;
    // casting to 'uint248' is safe because this amount was added through `pay`, which narrowed
    // it the same way: it cannot be wider coming out than it was going in.
    // forge-lint: disable-next-line(unsafe-typecast)
    _payments[lienId].paid -= uint248(amount);

    SafeERC20.safeTransfer(USDC, msg.sender, amount);
    emit Refunded(lienId, msg.sender, amount);
  }
}
