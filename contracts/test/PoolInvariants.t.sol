// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CaplanePool} from "../src/CaplanePool.sol";
import {ICaplaneRegistry} from "../src/interfaces/ICaplaneRegistry.sol";
import {RegistryFixture} from "./support/RegistryFixture.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

/// @dev Only user operations. Disbursement, repayment and write-down are driven by the registry
///      and are exercised by the unit tests; mixing them in here would make the price-per-share
///      invariant false by design, since a loss is supposed to lower it.
contract PoolHandler is Test {
  IERC20 internal immutable USDC;
  CaplanePool internal immutable POOL;
  address public immutable investor;

  /// @dev Assets returned for 1e18 shares at par. Shares carry twelve decimals more than the
  ///      asset, so one whole share is one USDC: 1e6, not 1e18. An empty vault already answers
  ///      exactly this — OZ's virtual offset makes `convertToAssets(1e18)` equal 1e6 with no
  ///      supply at all — so there is no special case to write, and writing one in the wrong
  ///      unit is what would make the invariant fail on the first deposit.
  uint256 public constant PAR = 1e6;

  uint256 public lowestPricePerShareSeen = type(uint256).max;

  constructor(
    CaplanePool pool,
    IERC20 usdc,
    // the zero check is the first line of the body; forge-lint does not recognise that form. A
    // zero investor would leave every sequenced call touching an account that can hold nothing,
    // and the invariants would pass over an empty vault without ever exercising one.
    // forge-lint: disable-next-line(missing-zero-check)
    address investor_
  ) {
    if (investor_ == address(0)) revert("investor is the zero address");
    POOL = pool;
    USDC = usdc;
    investor = investor_;
  }

  function pricePerShare() public view returns (uint256) {
    return POOL.convertToAssets(1e18);
  }

  function deposit(
    uint256 assets
  ) external {
    assets = bound(assets, 1, 100e6);
    vm.deal(investor, investor.balance + assets * 1e12);
    vm.startPrank(investor);
    USDC.approve(address(POOL), type(uint256).max);
    POOL.deposit(assets, investor);
    vm.stopPrank();
    _observe();
  }

  function redeem(
    uint256 shares
  ) external {
    uint256 cap = POOL.maxRedeem(investor);
    if (cap == 0) return;
    shares = bound(shares, 1, cap);
    vm.prank(investor);
    POOL.redeem(shares, investor, investor);
    _observe();
  }

  function _observe() private {
    uint256 now_ = pricePerShare();
    if (now_ < lowestPricePerShareSeen) lowestPricePerShareSeen = now_;
  }
}

/// @dev The property the standard actually guarantees: rounding favours the pool, so no user
///      operation can lower what a share is worth. Losses lower it — but a loss is not a user
///      operation, and it is driven from the registry, which this handler never touches.
contract PoolInvariantsTest is RegistryFixture {
  IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);

  /// @dev Pinned: an unpinned fork re-reads live state on every sequenced call. The default is
  ///      a real block on Arc Testnet so the suite runs without configuration; override it to
  ///      move the pin forward.
  uint256 internal constant DEFAULT_FORK_BLOCK = 61_500_000;

  CaplanePool internal pool;
  PoolHandler internal handler;

  function setUp() public override {
    vm.createSelectFork(vm.envString("ARC_TESTNET_RPC_URL"), vm.envOr("ARC_FORK_BLOCK", DEFAULT_FORK_BLOCK));
    // The real registry, deployed the way the fixture deploys it. A stub would be a mock, and
    // this project does not have those — not even where one would be convenient.
    super.setUp();
    pool = new CaplanePool(USDC, ICaplaneRegistry(address(registry)));
    handler = new PoolHandler(pool, USDC, makeAddr("investor"));
    targetContract(address(handler));
    // Mandatory on Arc: without it the fuzzer sends from arbitrary addresses, and the token's
    // blocklist precompile refuses them below the EVM, so the run dies on `Blocked address`.
    targetSender(address(this));
  }

  function invariant_PricePerShareNeverFallsFromAUserOperation() public view {
    assertGe(handler.lowestPricePerShareSeen(), handler.PAR());
  }

  function invariant_MaxRedeemIsAlwaysPayable() public view {
    assertLe(pool.convertToAssets(pool.maxRedeem(handler.investor())), USDC.balanceOf(address(pool)));
  }
}
