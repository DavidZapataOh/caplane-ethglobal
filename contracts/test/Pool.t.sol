// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplanePool} from "../src/CaplanePool.sol";
import {ICaplaneRegistry} from "../src/interfaces/ICaplaneRegistry.sol";
import {RegistryFixture} from "./support/RegistryFixture.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @dev Inherits the registry fixture: a lien can only be made through the registry's single
///      write path, so the pool's tests need a real registry, a real forwarder and real reports.
contract PoolTest is RegistryFixture {
  IERC20Metadata internal constant USDC = IERC20Metadata(0x3600000000000000000000000000000000000000);

  CaplanePool internal pool;
  address internal INVESTOR;

  /// @dev Fork first, deploy second: `super.setUp()` must land the registry on forked state.
  function setUp() public override {
    vm.createSelectFork(vm.envString("ARC_TESTNET_RPC_URL"));
    super.setUp();
    pool = new CaplanePool(IERC20(address(USDC)), ICaplaneRegistry(address(registry)));

    // Never a low address: 0x1 is the ecrecover precompile and holds most of the testnet supply.
    INVESTOR = makeAddr("investor");
    _fund(INVESTOR, 1000e6);
  }

  /// @dev The only way to fund on Arc. `deal(token, ...)` probes for a balanceOf slot that does
  ///      not exist here — the balance IS the account's native balance — and reverts in setUp.
  function _fund(
    address who,
    uint256 usdc6
  ) internal {
    vm.deal(who, usdc6 * 1e12);
  }

  /// @dev The offset is the whole donation defence, and it is invisible unless asserted. If
  ///      `decimals()` here is 6, `_decimalsOffset()` regressed to zero.
  function test_Pool_ExposesEighteenDecimalSharesOverASixDecimalAsset() public view {
    assertEq(USDC.decimals(), 6, "the asset is not what this vault was written against");
    assertEq(pool.decimals(), 18);
  }

  /// @dev On Arc `balanceOf` IS the native balance divided by 1e12, so a plain value send moves
  ///      it for 21,000 gas and leaves no log on the token. Refusing native value is the first
  ///      half of the defence; the offset is the second.
  function test_Pool_RefusesAPlainNativeSend() public {
    vm.deal(address(this), 1e18);
    (bool ok,) = address(pool).call{value: 1e18}("");
    assertFalse(ok, "the pool must have no receive(): a value send would inflate totalAssets");
  }

  /// @dev The first-depositor attack, run for real. With an offset of 12 the attacker must
  ///      donate an absurd amount to round the victim down to zero, so the victim keeps a
  ///      proportional claim and the attacker has burned the donation.
  function test_Pool_MakesTheInflationAttackUnprofitable() public {
    address attacker = makeAddr("attacker");
    _fund(attacker, 500e6 + 1); // the extra unit is the one share the attack starts with

    vm.startPrank(attacker);
    USDC.approve(address(pool), type(uint256).max);
    pool.deposit(1, attacker);
    // Checked: a donation that silently failed would make the whole attack test vacuous.
    assertTrue(USDC.transfer(address(pool), 500e6), "the donation did not land");
    vm.stopPrank();

    vm.startPrank(INVESTOR);
    USDC.approve(address(pool), type(uint256).max);
    uint256 shares = pool.deposit(100e6, INVESTOR);
    vm.stopPrank();

    assertGt(shares, 0, "the victim must not be rounded to zero");
    // Exact, not a band: at offset 0 the victim gets nothing, at 1 they lose 22%, at 2 they
    // already keep 97.9%. Only an exact figure distinguishes 12 from 2.
    assertEq(pool.previewRedeem(shares), 99_999_999, "the offset is not what it should be");
  }

  /// @dev Every mutative path must land on the side of its preview the EIP mandates.
  function test_Pool_RoundsOnTheSideTheStandardRequires() public {
    vm.startPrank(INVESTOR);
    USDC.approve(address(pool), type(uint256).max);

    uint256 previewed = pool.previewDeposit(100e6);
    uint256 minted = pool.deposit(100e6, INVESTOR);
    assertGe(minted, previewed, "deposit must not mint fewer shares than previewed");

    uint256 previewedAssets = pool.previewRedeem(minted);
    uint256 received = pool.redeem(minted, INVESTOR, INVESTOR);
    assertGe(received, previewedAssets, "redeem must not pay less than previewed");
    vm.stopPrank();
  }

  /// @dev The honest version of "no rounding loss": the user never gains at the pool's expense.
  function test_Pool_NeverReturnsMoreThanWasDeposited() public {
    vm.startPrank(INVESTOR);
    USDC.approve(address(pool), type(uint256).max);
    uint256 before = USDC.balanceOf(INVESTOR);
    uint256 shares = pool.deposit(250e6, INVESTOR);
    pool.redeem(shares, INVESTOR, INVESTOR);
    assertLe(USDC.balanceOf(INVESTOR), before, "a round trip must never profit the user");
    vm.stopPrank();
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

  function _releasedLien(
    address borrower,
    uint128 advance
  ) internal returns (bytes32 lienId) {
    lienId = _activeLien(borrower, advance, 150);
    _release(lienId);
  }

  function test_Disburse_PaysTheBorrowerTheRegistrySaysAndRecordsThePrincipal() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);

    uint256 before = USDC.balanceOf(BORROWER);
    pool.disburse(lienId);

    assertEq(USDC.balanceOf(BORROWER) - before, 250e6);
    assertEq(pool.outstandingPrincipal(), 250e6);
    assertGt(pool.fundedAt(lienId), 0);
  }

  /// @dev Anyone may trigger it. That is the property, not a side effect.
  function test_Disburse_IsPermissionless() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    vm.prank(address(0xDEADBEEF));
    pool.disburse(lienId);
    assertEq(pool.outstandingPrincipal(), 250e6);
  }

  /// @dev The registry has no `funded` flag and leaves the lien active after disbursement, so
  ///      without a local mark the same lien is paid twice.
  function test_Disburse_RefusesToPayTheSameLienTwice() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    vm.expectRevert(abi.encodeWithSelector(CaplanePool.AlreadyDisbursed.selector, lienId));
    pool.disburse(lienId);
  }

  function test_Disburse_RefusesALienThatIsNotActive() public {
    _seedPool(500e6);
    bytes32 lienId = _releasedLien(BORROWER, 250e6);
    vm.expectRevert(abi.encodeWithSelector(CaplanePool.LienNotFundable.selector, lienId));
    pool.disburse(lienId);
  }

  /// @dev Capital that has left the vault is still the investors' capital. Without this the
  ///      share price would collapse the instant an advance is made.
  function test_TotalAssets_CountsIdleCashAndLiveAdvances() public {
    _seedPool(500e6);
    uint256 before = pool.totalAssets();
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    assertEq(pool.totalAssets(), before, "lending must not change what the pool is worth");
    assertEq(USDC.balanceOf(address(pool)), before - 250e6);
  }

  /// @dev It must advertise only what it can actually pay today. ERC-4626 requires the cap and
  ///      requires it never to revert. The sibling function has to be capped too — in this
  ///      version of OpenZeppelin it derives from `maxRedeem`, so capping one caps both, and
  ///      this test is what would catch a future bump that reverts to deriving from `balanceOf`.
  function test_MaxWithdraw_IsAlsoCappedAndDoesNotRevert() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 400e6, 150);
    pool.disburse(lienId);

    uint256 advertised = pool.maxWithdraw(INVESTOR);
    assertLe(advertised, USDC.balanceOf(address(pool)), "it advertises more than it holds");
    vm.prank(INVESTOR);
    pool.withdraw(advertised, INVESTOR, INVESTOR); // must not revert
  }

  function test_MaxRedeem_IsCappedByIdleLiquidity() public {
    _seedPool(500e6);
    uint256 all = pool.balanceOf(INVESTOR);
    bytes32 lienId = _activeLien(BORROWER, 400e6, 150);
    pool.disburse(lienId);

    uint256 capped = pool.maxRedeem(INVESTOR);
    assertLt(capped, all, "the cap must reflect that most of the cash is lent out");
    vm.prank(INVESTOR);
    pool.redeem(capped, INVESTOR, INVESTOR); // must not revert
  }

  /// @dev `approve` is an external call, so it consumes an armed `expectRevert`. It is hoisted
  ///      out of `_repay` for that reason: a revert test funds and approves FIRST, then arms.
  function _payer() internal returns (address payer) {
    payer = makeAddr("payer");
    _fund(payer, 10_000e6);
    vm.prank(payer);
    USDC.approve(address(pool), type(uint256).max);
  }

  function _repay(
    bytes32 lienId
  ) internal {
    vm.prank(_payer());
    pool.repay(lienId);
  }

  /// @dev Face value is not on chain — it lives inside a peppered commitment — so the only
  ///      expression the chain can form is the advance times the rate.
  function test_AmountDue_IsTheAdvancePlusItsFlatFee() public {
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150); // 1.50%
    assertEq(pool.amountDue(lienId), 250e6 + 3_750_000);
  }

  function test_Repay_ClearsThePrincipalAndLeavesTheFeeBehind() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);

    uint256 assetsBefore = pool.totalAssets();
    _repay(lienId);

    assertEq(pool.outstandingPrincipal(), 0);
    assertEq(pool.totalAssets(), assetsBefore + 3_750_000, "the fee is the investors' return");
  }

  /// @dev The whole reason an investor is here.
  function test_Repay_RaisesThePricePerShare() public {
    _seedPool(500e6);
    uint256 shares = pool.balanceOf(INVESTOR);
    uint256 before = pool.previewRedeem(shares);

    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _repay(lienId);

    assertGt(pool.previewRedeem(shares), before);
  }

  function test_Repay_RefusesALienThatWasNeverDisbursed() public {
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    address payer = _payer();
    vm.prank(payer);
    vm.expectRevert(abi.encodeWithSelector(CaplanePool.NotDisbursed.selector, lienId));
    pool.repay(lienId);
  }

  /// @dev The second payment is refused as settled, not as never-disbursed: `fundedAt` still
  ///      holds the block it was funded in, and saying otherwise would tell the payer that an
  ///      advance they watched leave the pool never happened.
  function test_Repay_RefusesToBePaidTwice() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _repay(lienId);

    address payer = _payer();
    vm.prank(payer);
    vm.expectRevert(abi.encodeWithSelector(CaplanePool.AlreadySettled.selector, lienId));
    pool.repay(lienId);
  }

  function test_WriteDown_RealisesTheLossWhenTheRegistrySaysDefaulted() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);

    // The registry refuses a default before expiry, so the clock has to move first.
    vm.warp(EXPIRES);
    _default(lienId); // a signed report, after expiry, through the registry's only write path
    uint256 before = pool.totalAssets();

    vm.prank(address(0xDEADBEEF)); // anyone
    pool.writeDown(lienId);

    assertEq(pool.outstandingPrincipal(), 0);
    assertEq(pool.totalAssets(), before - 250e6, "the loss must be real, not deferred");
  }

  /// @dev A lien released without ever being repaid — the registry's Release branch cannot know
  ///      whether the pool funded it — must still be writeable down, or its principal is counted
  ///      for ever and the last redeemer pays for it.
  function test_WriteDown_RealisesTheLossOnAReleasedButUnrepaidLien() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    _release(lienId);

    uint256 before = pool.totalAssets();
    pool.writeDown(lienId);
    assertEq(pool.outstandingPrincipal(), 0, "principal must not be stranded by a release");
    assertEq(pool.totalAssets(), before - 250e6);
  }

  /// @dev The authorisation is the registry's status and nothing else. An active lien cannot be
  ///      written down by a caller who simply wants the price to fall.
  function test_WriteDown_RefusesALienThatIsStillActive() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    vm.expectRevert(abi.encodeWithSelector(CaplanePool.LienNotDefaulted.selector, lienId));
    pool.writeDown(lienId);
  }

  function test_WriteDown_LowersThePricePerShare() public {
    _seedPool(500e6);
    uint256 shares = pool.balanceOf(INVESTOR);
    uint256 before = pool.previewRedeem(shares);

    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);
    vm.warp(EXPIRES);
    _default(lienId);
    pool.writeDown(lienId);

    assertLt(pool.previewRedeem(shares), before);
  }

  /// @dev On Arc the ERC-20 balance is not a ledger: it is the account's native balance divided
  ///      by 1e12. Everything about this vault's donation defence rests on that, so it is
  ///      asserted against the real token rather than believed.
  function test_Usdc_BalanceIsTheNativeBalanceScaledDown() public {
    // By delta, never by absolute value: this runs against live testnet state, and asserting
    // that some address holds nothing goes red the day somebody touches it.
    address probe = makeAddr("probe");
    uint256 before = USDC.balanceOf(probe);
    vm.deal(probe, probe.balance + 1.5e18);
    assertEq(USDC.balanceOf(probe) - before, 1_500_000, "balanceOf must track the native balance / 1e12");
  }

  /// @dev The investor's whole round trip, measured under `--isolate` so each call is charged
  ///      as its own transaction: intrinsic gas and calldata included, which is what a receipt
  ///      would say and what the budget is written against. Going through Circle's proxy and
  ///      its precompile costs materially more than a plain ERC-20, so the figures a reference
  ///      vault would produce do not apply here.
  function test_Pool_InvestorLifecycleStaysInBudget() public {
    _fund(INVESTOR, 100e6);
    vm.startPrank(INVESTOR);

    uint256 b = gasleft();
    USDC.approve(address(pool), type(uint256).max);
    uint256 approveGas = b - gasleft();

    b = gasleft();
    uint256 shares = pool.deposit(100e6, INVESTOR);
    uint256 depositGas = b - gasleft();

    b = gasleft();
    pool.redeem(shares, INVESTOR, INVESTOR);
    uint256 redeemGas = b - gasleft();
    vm.stopPrank();

    emit log_named_uint("approve", approveGas);
    emit log_named_uint("deposit", depositGas);
    emit log_named_uint("redeem", redeemGas);
    emit log_named_uint("lifecycle", approveGas + depositGas + redeemGas);
    // The budget is written against the receipt, so it binds under `--isolate` — where this
    // reads 240,679 — and is loose in the default run, where the same three calls measure
    // 168,827 because execution gas charges no intrinsic cost and no calldata.
    assertLt(approveGas + depositGas + redeemGas, 250_000, "the investor round trip regressed");
  }

  /// @dev Both halves in one word. The slot index comes from `evidence/storage/CaplanePool.txt`;
  ///      if an unrelated state variable is added above it, this fails and the layout evidence
  ///      is where the new number is. Asserted after a disbursement, which is the only moment
  ///      both halves are written.
  function test_Pool_KeepsOneAdvancePerWord() public {
    _seedPool(500e6);
    bytes32 lienId = _activeLien(BORROWER, 250e6, 150);
    pool.disburse(lienId);

    bytes32 slot = keccak256(abi.encode(lienId, uint256(6)));
    uint256 word = uint256(vm.load(address(pool), slot));
    assertEq(word & type(uint128).max, 250e6, "the principal is not in the low half");
    assertEq((word >> 128) & type(uint64).max, block.number, "fundedAt is not beside it");
    assertEq(vm.load(address(pool), bytes32(uint256(slot) + 1)), bytes32(0), "it spilled");
  }
}
