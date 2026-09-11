// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplaneEscrow} from "../src/CaplaneEscrow.sol";
import {CaplanePool} from "../src/CaplanePool.sol";
import {ICaplaneRegistry} from "../src/interfaces/ICaplaneRegistry.sol";
import {RegistryFixture} from "./support/RegistryFixture.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract EscrowTest is RegistryFixture {
  IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);

  CaplanePool internal pool;
  CaplaneEscrow internal escrow;
  address internal DEBTOR;
  address internal INVESTOR;

  function setUp() public override {
    vm.createSelectFork(vm.envString("ARC_TESTNET_RPC_URL"));
    super.setUp();
    pool = new CaplanePool(USDC, ICaplaneRegistry(address(registry)));
    escrow = new CaplaneEscrow(USDC, ICaplaneRegistry(address(registry)), pool);

    DEBTOR = makeAddr("debtor");
    INVESTOR = makeAddr("investor");
  }

  /// @dev The only way to fund on Arc: the ERC-20 balance IS the native balance over 1e12.
  function _fund(
    address who,
    uint256 usdc6
  ) internal {
    vm.deal(who, who.balance + usdc6 * 1e12);
  }

  /// @dev `approve` is an external call and would consume an armed `expectRevert`, so a revert
  ///      test funds and approves through `_allow` FIRST and arms immediately before `pay`.
  function _allow(
    address who,
    uint256 amount
  ) internal {
    _fund(who, amount);
    vm.prank(who);
    USDC.approve(address(escrow), amount);
  }

  function _pay(
    address who,
    bytes32 lienId,
    uint256 amount
  ) internal {
    _allow(who, amount);
    vm.prank(who);
    escrow.pay(lienId, amount);
  }

  function _seedPool(
    uint256 assets
  ) internal {
    _fund(INVESTOR, assets);
    vm.startPrank(INVESTOR);
    USDC.approve(address(pool), type(uint256).max);
    pool.deposit(assets, INVESTOR);
    vm.stopPrank();
  }

  function test_Pay_CreditsTheLienAndHoldsTheMoney() public {
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    _pay(DEBTOR, lienId, 100e6);

    assertEq(escrow.paidFor(lienId), 100e6);
    assertEq(escrow.paidBy(lienId, DEBTOR), 100e6);
    assertEq(USDC.balanceOf(address(escrow)), 100e6);
  }

  /// @dev The dossier's `repay(commitment, amount)` carries an amount and says "al completarse".
  ///      Partials are the reason this contract exists rather than a call straight to the pool.
  function test_Pay_AccumulatesAcrossSeveralPayments() public {
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    address other = makeAddr("someone else");
    _pay(DEBTOR, lienId, 100e6);
    _pay(DEBTOR, lienId, 60e6);
    _pay(other, lienId, 40e6);

    assertEq(escrow.paidFor(lienId), 200e6, "payments accumulate, whoever sends them");
    assertEq(escrow.paidBy(lienId, DEBTOR), 160e6, "and each payer's own share is kept apart");
    assertEq(escrow.paidBy(lienId, other), 40e6);
  }

  function test_Pay_CreditsOnlyTheLienItWasSentFor() public {
    bytes32 a = _activeLien(BORROWER, 250e6, 150);
    bytes32 b = _activeLien(BORROWER, 250e6, 150);
    _pay(DEBTOR, a, 100e6);

    assertEq(escrow.paidFor(a), 100e6);
    assertEq(escrow.paidFor(b), 0, "one lien's money must never land on another");
    assertEq(escrow.paidBy(b, DEBTOR), 0);
  }

  /// @dev A plain value send carries no lien, and on this chain it does not even call the
  ///      contract — the balance moves through a precompile. Money with no claim attached would
  ///      simply be stranded, so it is refused.
  function test_Escrow_RefusesAPlainNativeSend() public {
    vm.deal(address(this), 1e18);
    (bool ok,) = address(escrow).call{value: 1e18}("");
    assertFalse(ok, "no receive(): an unattributable payment is lost money");
  }

  /// @dev A released or defaulted lien has no exit — `pool.repay` requires an active one — so a
  ///      payment towards it could only ever be refunded, never settled. Refused at the door.
  function test_Pay_RefusesALienWithNoWayOut() public {
    bytes32 released = _activeLien(BORROWER, 250e6, 150);
    _release(released);

    _allow(DEBTOR, 10e6);
    vm.prank(DEBTOR);
    vm.expectRevert(abi.encodeWithSelector(CaplaneEscrow.LienNotPayable.selector, released, 2));
    escrow.pay(released, 10e6);
  }

  function test_Pay_RefusesALienThatDoesNotExist() public {
    bytes32 nowhere = bytes32(uint256(0xDEAD));
    _allow(DEBTOR, 10e6);
    vm.prank(DEBTOR);
    vm.expectRevert(abi.encodeWithSelector(CaplaneEscrow.LienNotPayable.selector, nowhere, 0));
    escrow.pay(nowhere, 10e6);
  }

  /// @dev Free log spam on an event a workflow will filter on.
  function test_Pay_RefusesAnEmptyPayment() public {
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    vm.prank(DEBTOR);
    vm.expectRevert(abi.encodeWithSelector(CaplaneEscrow.NothingToPay.selector, lienId));
    escrow.pay(lienId, 0);
  }

  /// @dev A mismatched deployment is silent otherwise: payments accumulate in one token while
  ///      settlement approves the pool in another, and the failure surfaces inside `repay`.
  function test_Constructor_RefusesAPoolFromAnotherSystem() public {
    CaplanePool stranger = new CaplanePool(USDC, ICaplaneRegistry(address(0xBEEF)));
    vm.expectRevert(CaplaneEscrow.Misconfigured.selector);
    new CaplaneEscrow(USDC, ICaplaneRegistry(address(registry)), stranger);
  }

  function test_Settle_PaysThePoolAndReturnsTheRestToTheBusiness() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);

    uint256 due = pool.amountDue(lienId); // 250e6 + 3_750_000
    _pay(DEBTOR, lienId, 300e6); // the debtor pays the face value they owe

    uint256 poolBefore = USDC.balanceOf(address(pool));
    uint256 borrowerBefore = USDC.balanceOf(BORROWER);

    escrow.settle(lienId);

    assertEq(USDC.balanceOf(address(pool)) - poolBefore, due, "the pool takes advance plus fee");
    assertEq(USDC.balanceOf(BORROWER) - borrowerBefore, 300e6 - due, "the surplus belongs to the business");
    assertEq(USDC.balanceOf(address(escrow)), 0, "the escrow keeps nothing");
    assertEq(escrow.paidFor(lienId), 0);
    assertTrue(escrow.settled(lienId));
  }

  /// @dev Anyone settles. That is the property: no keeper, no privileged trigger.
  function test_Settle_IsPermissionless() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _pay(DEBTOR, lienId, 300e6);

    vm.prank(address(0xDEADBEEF));
    escrow.settle(lienId);
    assertTrue(escrow.settled(lienId));
  }

  /// @dev This is the event the workflow's second trigger watches, and a log trigger filters on
  ///      topic0, so the signature is pinned here rather than discovered later.
  function test_Settle_EmitsTheEventTheEnclaveWillWatch() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    uint256 due = pool.amountDue(lienId);
    _pay(DEBTOR, lienId, 300e6);

    vm.expectEmit(true, false, false, true);
    emit CaplaneEscrow.Settled(lienId, due, 300e6 - due);
    escrow.settle(lienId);
  }

  function test_Settle_RefusesWhileThePaymentsFallShort() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _pay(DEBTOR, lienId, 100e6);
    uint256 due = pool.amountDue(lienId);

    vm.expectRevert(abi.encodeWithSelector(CaplaneEscrow.NotYetCovered.selector, lienId, 100e6, due));
    escrow.settle(lienId);
  }

  /// @dev Exactly the amount due is enough, and leaves nothing for the business.
  function test_Settle_AcceptsTheExactAmountAndReturnsNothing() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    uint256 due = pool.amountDue(lienId);
    _pay(DEBTOR, lienId, due);

    uint256 borrowerBefore = USDC.balanceOf(BORROWER);
    escrow.settle(lienId);
    assertEq(USDC.balanceOf(BORROWER), borrowerBefore);
  }

  /// @dev Nothing is left approved. Asserted rather than assumed: today `repay` happens to pull
  ///      exactly what was approved, and the day it pulls less a live allowance would survive.
  function test_Settle_LeavesNoAllowanceBehind() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _pay(DEBTOR, lienId, 300e6);
    escrow.settle(lienId);
    assertEq(USDC.allowance(address(escrow), address(pool)), 0);
  }

  /// @dev The registry leaves the lien active after settlement — nothing produces the release
  ///      report yet — so without a local mark the escrow would keep taking money it can no
  ///      longer hand on. A griefer could then burn a debtor's real payment.
  function test_Settle_ClosesTheLienToFurtherPayments() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _pay(DEBTOR, lienId, 300e6);
    escrow.settle(lienId);

    assertEq(uint256(registry.statusOf(lienId)), 1, "the registry still says active");

    _allow(DEBTOR, 50e6);
    vm.prank(DEBTOR);
    vm.expectRevert(abi.encodeWithSelector(CaplaneEscrow.AlreadySettled.selector, lienId));
    escrow.pay(lienId, 50e6);
  }

  function test_Settle_RefusesToSettleTwice() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _pay(DEBTOR, lienId, 300e6);
    escrow.settle(lienId);

    vm.expectRevert(abi.encodeWithSelector(CaplaneEscrow.AlreadySettled.selector, lienId));
    escrow.settle(lienId);
  }

  /// @dev The case this exists for, and it needs no attacker: the debtor pays part of what they
  ///      owe, the term passes, a signed report marks the lien defaulted, and settlement is now
  ///      impossible for ever. Without this the payment is destroyed.
  function test_Refund_ReturnsAPayerTheirMoneyOnceSettlementBecameImpossible() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _pay(DEBTOR, lienId, 100e6);

    vm.warp(EXPIRES);
    _default(lienId);
    // The loss has to be realised first. While principal is still out on the lien this money may
    // yet be owed to the pool, and handing it back before then is how a covered advance became
    // a total loss. `writeDown` is permissionless, so the payer can call it themselves.
    pool.writeDown(lienId);

    uint256 before = USDC.balanceOf(DEBTOR);
    vm.prank(DEBTOR);
    escrow.refund(lienId);

    assertEq(USDC.balanceOf(DEBTOR) - before, 100e6, "the payer gets their own money back");
    assertEq(escrow.paidFor(lienId), 0);
    assertEq(escrow.paidBy(lienId, DEBTOR), 0);
    assertEq(USDC.balanceOf(address(escrow)), 0, "the escrow keeps nothing");
  }

  /// @dev The third of the three legitimate closures, and the least obvious: `pool.repay` is
  ///      permissionless by design, so the business can settle its own advance directly and
  ///      leave the escrow holding a payment with nowhere to go.
  function test_Refund_OpensWhenTheBorrowerRepaidThePoolDirectly() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _pay(DEBTOR, lienId, 100e6);

    _fund(BORROWER, 500e6);
    vm.startPrank(BORROWER);
    USDC.approve(address(pool), type(uint256).max);
    pool.repay(lienId);
    vm.stopPrank();

    uint256 before = USDC.balanceOf(DEBTOR);
    vm.prank(DEBTOR);
    escrow.refund(lienId);
    assertEq(USDC.balanceOf(DEBTOR) - before, 100e6);
  }

  /// @dev While settlement is still on the table the money stays: this is a refund for a closed
  ///      exit, not a way to walk back a payment that is still going to be handed on.
  function test_Refund_IsClosedWhileSettlementIsStillPossible() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _pay(DEBTOR, lienId, 100e6);

    vm.prank(DEBTOR);
    vm.expectRevert(abi.encodeWithSelector(CaplaneEscrow.StillSettleable.selector, lienId));
    escrow.refund(lienId);
  }

  /// @dev Settlement pays everything out but cannot clear every payer's record — there is no
  ///      way to enumerate them — so those records outlive the money. Removing the guard does
  ///      not open a drain: the subtraction from `paidFor`, already zero, underflows and the
  ///      call panics. What this pins is that a payer asking for money that was already handed
  ///      on is told so, rather than getting an arithmetic panic with no explanation.
  function test_Refund_IsRefusedAfterSettlementEvenThoughTheRecordSurvives() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _pay(DEBTOR, lienId, 300e6);
    escrow.settle(lienId);

    assertEq(escrow.paidBy(lienId, DEBTOR), 300e6, "the per-payer record outlives the money");

    vm.prank(DEBTOR);
    vm.expectRevert(abi.encodeWithSelector(CaplaneEscrow.AlreadySettled.selector, lienId));
    escrow.refund(lienId);
  }

  function test_Refund_PaysEachPayerOnlyTheirOwnShare() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    address other = makeAddr("someone else");
    _pay(DEBTOR, lienId, 100e6);
    _pay(other, lienId, 40e6);

    vm.warp(EXPIRES);
    _default(lienId);
    pool.writeDown(lienId);

    uint256 before = USDC.balanceOf(DEBTOR);
    vm.prank(DEBTOR);
    escrow.refund(lienId);

    assertEq(USDC.balanceOf(DEBTOR) - before, 100e6, "a payer must not take another's money");
    assertEq(escrow.paidFor(lienId), 40e6, "the other payer's claim survives");
    assertEq(USDC.balanceOf(address(escrow)), 40e6);
  }

  function test_Refund_RefusesSomeoneWhoNeverPaid() public {
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    _release(lienId);

    vm.prank(DEBTOR);
    vm.expectRevert(abi.encodeWithSelector(CaplaneEscrow.NothingToRefund.selector, lienId, DEBTOR));
    escrow.refund(lienId);
  }

  /// @dev Both halves in one word, asserted where it matters: the settled flag has to live in
  ///      the top byte of the same word that holds the running total. Checking "next slot is
  ///      empty" after a payment alone passes against every layout, including the two separate
  ///      mappings this replaces, because until settlement nobody has written the flag.
  function test_Escrow_KeepsOnePaymentPerWord() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _pay(DEBTOR, lienId, 300e6);
    escrow.settle(lienId);

    bytes32 slot = keccak256(abi.encode(lienId, uint256(0)));
    uint256 word = uint256(vm.load(address(escrow), slot));
    assertEq(word >> 248, 1, "the settled flag is not in the payment word");
    assertEq(vm.load(address(escrow), bytes32(uint256(slot) + 1)), bytes32(0), "it spilled");
  }

  /// @dev The defect the audit found, end to end, kept as a regression test. A debtor pays in
  ///      full late in the term, nobody calls `settle`, and the default report lands. Before the
  ///      fix, `settle` reverted for ever inside `pool.repay`, `refund` opened, the payer walked
  ///      out whole and the investors absorbed the entire advance — with the cash to cover it
  ///      sitting in this contract the whole time. No attacker, no collusion.
  function test_Settle_StillReachesThePoolAfterATerminalReport() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);

    uint256 due = pool.amountDue(lienId);
    _pay(DEBTOR, lienId, due);

    vm.warp(EXPIRES);
    _default(lienId);
    assertEq(uint256(registry.statusOf(lienId)), 3, "the lien really is closed");

    uint256 poolBefore = USDC.balanceOf(address(pool));
    escrow.settle(lienId);

    assertEq(USDC.balanceOf(address(pool)) - poolBefore, due, "the pool must still be made whole");
    assertEq(pool.outstandingPrincipal(), 0);
    assertEq(USDC.balanceOf(address(escrow)), 0, "the escrow keeps nothing");
  }

  /// @dev And the mirror: while the pool is still owed, that money cannot leave backwards.
  function test_Refund_IsClosedWhileThePoolIsStillOwed() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _pay(DEBTOR, lienId, pool.amountDue(lienId));

    vm.warp(EXPIRES);
    _default(lienId);

    vm.prank(DEBTOR);
    vm.expectRevert(abi.encodeWithSelector(CaplaneEscrow.StillSettleable.selector, lienId));
    escrow.refund(lienId);
  }
}
