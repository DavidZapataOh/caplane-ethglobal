// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplanePool} from "../../src/CaplanePool.sol";
import {ICaplaneRegistry} from "../../src/interfaces/ICaplaneRegistry.sol";
import {RegistryFixture} from "../support/RegistryFixture.sol";
import {Reports} from "../support/Reports.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Properties that sound like invariants and are false by design. A boundary's place is
///         a test that pins it, not a sentence in a document, and a limit stated with a number
///         is evidence where one stated with an adjective is a hope.
contract FalsifiedTest is RegistryFixture {
  IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);

  CaplanePool internal pool;
  address internal INVESTOR;

  function setUp() public override {
    vm.createSelectFork(vm.envString("ARC_TESTNET_RPC_URL"));
    super.setUp();
    pool = new CaplanePool(USDC, ICaplaneRegistry(address(registry)));
    INVESTOR = makeAddr("investor");
  }

  function _fund(
    address who,
    uint256 usdc6
  ) internal {
    vm.deal(who, who.balance + usdc6 * 1e12);
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

  /// @dev "Every active lien has been disbursed" is false: recording and funding are separate,
  ///      permissionless calls, and an under-capitalised pool leaves active, unfunded liens
  ///      indefinitely. The separation is deliberate — it is the gap the atomicity argument was
  ///      written to close and then found unbuildable against the frozen interface.
  function test_False_AnActiveLienNeedNotHaveBeenDisbursed() public {
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    assertEq(uint256(registry.statusOf(lienId)), 1);
    assertEq(pool.fundedAt(lienId), 0);
  }

  /// @dev "Every disbursed lien is active" is false: the funding record is never cleared, so a
  ///      released or defaulted lien keeps it — which is what makes an audit possible later.
  function test_False_ADisbursedLienNeedNotStillBeActive() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _release(lienId);
    assertGt(pool.fundedAt(lienId), 0);
    assertEq(uint256(registry.statusOf(lienId)), 2);
  }

  /// @dev "matchesOf returns the best active lien" is false, and the frozen NatSpec says it. The
  ///      argmax runs only over liens reachable through the three indexed positions, which is the
  ///      design: the amount bucket is scored but never indexed. A fuzzer generating random
  ///      tuples falsifies the interface's sentence in seconds, so the sentence is what changes.
  function test_False_MatchesOfIsAnArgmaxOverEveryActiveLien() public {
    bytes32[] memory stored = _fresh();
    bytes32 lienId =
      keccak256(abi.encodePacked(stored[0], stored[1], stored[2], stored[3], stored[4], stored[5], stored[6]));
    _send(Reports.body(1, SELECTOR, _next(), lienId, SUBMISSION_1, BORROWER, 250e6, 150, EXPIRES, stored));

    bytes32[] memory query = _fresh();
    query[2] = stored[2]; // agrees only on the component that is scored and never indexed

    (bytes32 found, uint8 matched) = registry.matchesOf(query);
    assertEq(found, bytes32(0), "unreachable through the index is unreachable, by design");
    assertEq(matched, 0, "and the count is zero, not one");
  }

  /// @dev "A shareholder can always redeem something" is false: an advance can take idle
  ///      liquidity to exactly zero, and a fully lent-out vault is a legitimate state of a
  ///      lending vault rather than a failure of one.
  function test_False_AShareholderCanAlwaysRedeemSomething() public {
    _seedPool(250e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);

    assertGt(pool.balanceOf(INVESTOR), 0);
    assertEq(USDC.balanceOf(address(pool)), 0);
    assertEq(pool.maxRedeem(INVESTOR), 0, "fully lent out is a legitimate state");
  }

  /// @dev The write-down window, with the number rather than the adjective. Between a default
  ///      landing and anyone calling for the loss, a redemption exits at the pre-loss price and
  ///      the difference is paid by whoever stays.
  function test_False_TheWriteDownWindowIsHarmless() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    vm.warp(EXPIRES);
    _default(lienId);

    uint256 escaping = pool.previewRedeem(pool.balanceOf(INVESTOR));
    pool.writeDown(lienId);
    uint256 staying = pool.previewRedeem(pool.balanceOf(INVESTOR));

    assertGt(escaping, staying, "the window is real");
    emit log_named_uint("USDC transferred from those who stay to whoever leaves first", escaping - staying);
  }

  /// @dev The defect this work existed to find, kept as a regression test. A lien released
  ///      without ever being repaid used to satisfy neither `repay` (which wants an active lien)
  ///      nor the loss path (which wanted a defaulted one), so its principal stayed counted for
  ///      ever: the share price stayed permanently inflated and the last redeemer paid for it.
  function test_AReleasedButUnrepaidLienCanStillBeWrittenDown() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _release(lienId);

    pool.writeDown(lienId);
    assertEq(pool.outstandingPrincipal(), 0, "principal must never be stranded");
  }
}
