// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplaneEscrow} from "../../src/CaplaneEscrow.sol";
import {CaplanePool} from "../../src/CaplanePool.sol";
import {ICaplaneRegistry} from "../../src/interfaces/ICaplaneRegistry.sol";
import {RegistryFixture} from "../support/RegistryFixture.sol";
import {Ghosts} from "./Ghosts.sol";
import {SystemHandler} from "./Handlers.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev The only suite that crosses the registry/pool/escrow boundary, which is where every
///      defect this work found actually lived. It forks Arc because the asset's `balanceOf` is
///      the account's native balance divided by 1e12 and no test double reproduces that.
/// forge-config: default.invariant.runs = 8
/// forge-config: default.invariant.depth = 200
/// forge-config: ci.invariant.runs = 16
/// forge-config: ci.invariant.depth = 200
contract MoneyInvariantsTest is RegistryFixture {
  IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);

  address internal constant ACTOR_A = address(0xA11CE);
  address internal constant ACTOR_B = address(0xB0B);

  /// @dev Pinned: an unpinned fork re-reads live state on every sequenced call. The default is a
  ///      real block on Arc Testnet so the suite runs without configuration.
  uint256 internal constant DEFAULT_FORK_BLOCK = 61_500_000;

  Ghosts internal ghosts;
  SystemHandler internal handler;
  CaplanePool internal pool;
  CaplaneEscrow internal escrow;

  function setUp() public override {
    vm.createSelectFork(vm.envString("ARC_TESTNET_RPC_URL"), vm.envOr("ARC_FORK_BLOCK", DEFAULT_FORK_BLOCK));
    super.setUp();
    pool = new CaplanePool(USDC, ICaplaneRegistry(address(registry)));
    escrow = new CaplaneEscrow(USDC, ICaplaneRegistry(address(registry)), pool);
    ghosts = new Ghosts();
    handler = new SystemHandler(registry, forwarder, ghosts, OWNER, NAME, SELECTOR, pool, escrow, USDC);

    targetContract(address(handler));
    // Not a performance tweak. Without this the fuzzer draws a fresh random sender per call,
    // every one a cache miss against the fork, and the run either rate-limits the endpoint after
    // ten minutes or dies outright on `Blocked address` — the toolchain enforces Arc's own
    // blocked-sender rules and the fuzzer eventually picks a blocked one.
    targetSender(ACTOR_A);
    targetSender(ACTOR_B);
  }

  /// @dev The pool cannot enumerate the registry, so this is a sum over the pool's own records.
  ///      Stated over ALL ids ever recorded — summing over live ones would hide principal
  ///      stranded on a lien that left the live set, which is exactly the defect this found.
  function invariant_OutstandingIsTheSumOfLivePrincipals() public view {
    uint256 total;
    for (uint256 i; i < ghosts.allLienIdsLength(); ++i) {
      total += pool.principalOf(ghosts.allLienIds(i));
    }
    assertEq(pool.outstandingPrincipal(), total);
  }

  function invariant_PrincipalIsConserved() public view {
    assertEq(
      ghosts.totalEverDisbursed() - ghosts.totalEverRepaidPrincipal() - ghosts.totalEverWrittenDown(),
      pool.outstandingPrincipal()
    );
  }

  /// @dev A delta against the value before the last action, not a floor. The floor form cannot
  ///      fail with a deposit-and-redeem handler, because rounding alone never moves the price
  ///      off par; only a loss does, and a loss is not a user operation.
  function invariant_PricePerShareNeverFallsFromAUserOperation() public view {
    if (!ghosts.lastActionWasUserFacing()) return;
    assertGe(pool.convertToAssets(1e18), ghosts.lastPricePerShare());
  }

  /// @dev The standard requires the advertised maximum never to exceed what would succeed.
  function invariant_MaxRedeemIsAlwaysPayable() public view {
    assertLe(pool.convertToAssets(pool.maxRedeem(handler.INVESTOR())), USDC.balanceOf(address(pool)));
  }

  /// @dev Inequality, deliberately. Anyone can transfer USDC to either contract and nothing
  ///      refuses it, so equality would be false for a reason that is not a defect.
  function invariant_AttributedMoneyIsCovered() public view {
    uint256 attributed;
    for (uint256 i; i < ghosts.allLienIdsLength(); ++i) {
      attributed += escrow.paidFor(ghosts.allLienIds(i));
    }
    assertGe(USDC.balanceOf(address(escrow)), attributed);
  }

  /// @dev And the difference has to be accounted for too, or a missing accounting path hides
  ///      inside the inequality above.
  function invariant_NothingArrivesUnexplained() public view {
    assertEq(USDC.balanceOf(address(escrow)) - ghosts.sumOfPaidFor(), ghosts.donatedToEscrow());
  }

  function afterInvariant() public view {
    for (uint256 i; i < ghosts.exposedSelectorCount(); ++i) {
      bytes4 sel = ghosts.exposedSelector(i);
      assertGt(
        ghosts.callsBySelector(sel) + ghosts.revertsBySelector(sel),
        0,
        string.concat("the fuzzer never reached a handler action: ", vm.toString(sel))
      );
    }
  }

  /// @dev Every action can actually succeed, scripted so it is deterministic. The reached-check
  ///      above catches an action the fuzzer never calls; this catches one that can never work.
  /// @dev Every action can actually succeed, scripted so it is deterministic. The reached-check
  ///      above catches an action the fuzzer never calls; this catches one that can never work.
  ///      Amounts stay inside the handler's own bounds: `bound` wraps rather than clamps, so a
  ///      number above the ceiling silently becomes a different one and the pool runs dry.
  function test_Handler_EveryActionSucceedsOnce() public {
    handler.deposit(200e6);
    handler.redeem(1e18); // while the vault is still entirely liquid
    handler.deposit(200e6);

    handler.recordLien(7, 150e6, 150, 30 days);
    handler.recordLien(8, 100e6, 150, 30 days);
    handler.recordLien(9, 50e6, 150, 30 days);
    handler.disburse(0);
    handler.disburse(1);
    handler.disburse(2);

    handler.pay(0, 200e6);
    handler.settle(0);
    handler.repay(1);
    handler.pay(2, 30e6);
    handler.releaseLien(2);
    // The loss has to be realised before the payer's money is released: while principal is out
    // on the lien, that payment may still be owed to the pool.
    handler.writeDown(2);
    handler.refund(2);

    handler.recordLien(11, 50e6, 150, 30 days);
    handler.disburse(3);
    handler.defaultLien(3);
    handler.writeDown(3);

    handler.rejectSubmission(9, 3);
    handler.donateToPool(1e6);
    handler.donateToEscrow(1e6);

    for (uint256 i; i < ghosts.exposedSelectorCount(); ++i) {
      bytes4 sel = ghosts.exposedSelector(i);
      assertGt(ghosts.callsBySelector(sel), 0, string.concat("a handler action can never succeed: ", vm.toString(sel)));
    }
  }
}
