// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ICaplaneInbox} from "../src/interfaces/ICaplaneInbox.sol";
import {ICaplaneRegistry} from "../src/interfaces/ICaplaneRegistry.sol";
import {ReportCodec} from "../src/libraries/ReportCodec.sol";
import {MinimalReceiver} from "./receivers/MinimalReceiver.sol";
import {Test, console2} from "forge-std/Test.sol";

contract FrozenInterfaceTest is Test {
  function test_ReceiverInterfaceId_IsChainlinkIReceiver() public pure {
    assertEq(bytes32(ICaplaneRegistry.onReport.selector), bytes32(bytes4(0x805f2132)));
  }

  function test_ReadSurface_SelectorsAreFrozen() public pure {
    assertEq(bytes32(ICaplaneRegistry.isEncumbered.selector), bytes32(bytes4(keccak256("isEncumbered(bytes32)"))));
    assertEq(bytes32(ICaplaneRegistry.statusOf.selector), bytes32(bytes4(keccak256("statusOf(bytes32)"))));
    assertEq(bytes32(ICaplaneRegistry.matchesOf.selector), bytes32(bytes4(keccak256("matchesOf(bytes32[])"))));
  }

  function test_Errors_SelectorsAreFrozen() public pure {
    assertEq(bytes32(ICaplaneRegistry.NotForwarder.selector), bytes32(bytes4(keccak256("NotForwarder(address)"))));
    assertEq(
      bytes32(ICaplaneRegistry.WrongWorkflowOwner.selector), bytes32(bytes4(keccak256("WrongWorkflowOwner(address)")))
    );
    assertEq(
      bytes32(ICaplaneRegistry.WrongWorkflowName.selector), bytes32(bytes4(keccak256("WrongWorkflowName(bytes10)")))
    );
    assertEq(
      bytes32(ICaplaneRegistry.AlreadyEncumbered.selector), bytes32(bytes4(keccak256("AlreadyEncumbered(bytes32)")))
    );
    assertEq(
      bytes32(ICaplaneRegistry.WrongComponentCount.selector), bytes32(bytes4(keccak256("WrongComponentCount(uint256)")))
    );
    assertEq(
      bytes32(ICaplaneInbox.WrongSubmissionId.selector),
      bytes32(bytes4(keccak256("WrongSubmissionId(bytes32,bytes32)")))
    );
  }

  /// @dev The inbox's reads. `submittedAt` was a public mapping and is now an explicit
  ///      function; both forms produce the same signature, so the selector must not have moved.
  function test_InboxReadSurface_SelectorsAreFrozen() public pure {
    assertEq(bytes32(ICaplaneInbox.submittedAt.selector), bytes32(bytes4(keccak256("submittedAt(bytes32)"))));
    assertEq(bytes32(ICaplaneInbox.submitterOf.selector), bytes32(bytes4(keccak256("submitterOf(bytes32)"))));
    assertEq(bytes32(ICaplaneInbox.submittedAt.selector), bytes32(bytes4(0x5cb1cf58)));
  }

  function test_Events_Topic0IsFrozen() public pure {
    assertEq(ICaplaneInbox.ClaimSubmitted.selector, keccak256("ClaimSubmitted(bytes32,address,bytes)"));
    assertEq(ICaplaneRegistry.LienRecorded.selector, keccak256("LienRecorded(bytes32,address,uint64)"));
    assertEq(ICaplaneRegistry.SubmissionRejected.selector, keccak256("SubmissionRejected(bytes32,uint8)"));
  }

  /// @dev Measures real storage, not arithmetic. Writing a fully non-zero Lien must dirty
  ///      exactly three slots; a fourth would mean the field order regressed and every lien
  ///      would cost an extra cold SSTORE.
  function test_LienStruct_OccupiesExactlyThreeStorageSlots() public {
    LienStore store = new LienStore();
    store.set(
      ICaplaneRegistry.Lien({
        borrower: address(0xB0110E1),
        rateBps: 150,
        createdAt: 1_789_000_000,
        advanceUsdc6: 250_000_000,
        expiresAt: 1_799_000_000,
        status: 1,
        submissionId: bytes32(uint256(0x5AB))
      })
    );

    assertTrue(vm.load(address(store), bytes32(uint256(0))) != bytes32(0), "slot 0 unused");
    assertTrue(vm.load(address(store), bytes32(uint256(1))) != bytes32(0), "slot 1 unused");
    assertTrue(vm.load(address(store), bytes32(uint256(2))) != bytes32(0), "slot 2 unused");
    assertEq(vm.load(address(store), bytes32(uint256(3))), bytes32(0), "struct spilled into slot 3");
  }

  function test_ReportCodec_DecodesTheGoldenVector() public pure {
    ReportCodec.ReportBody memory b = ReportCodec.decode(_goldenVector());

    assertEq(uint8(b.kind), 1);
    assertEq(b.chainSelector, 3_034_092_155_422_581_607);
    assertEq(b.advanceUsdc6, 250_000_000);
    assertEq(b.rateBps, 150);
    assertEq(b.componentCommitments.length, 7);
  }

  /// @dev 5120-byte report limit minus the forwarder's 109-byte header.
  function test_ReportCodec_GoldenVectorFitsTheReportBudget() public pure {
    assertLe(_goldenVector().length, 5011);
  }

  /// @dev The forwarder runs ERC165Checker before calling. Failing it marks the transmission
  ///      permanently invalid — every retry reverts AlreadyAttempted and the report is lost.
  function test_SupportsInterface_AnswersAllThreeProbes() public {
    MinimalReceiver r = new MinimalReceiver();
    assertTrue(r.supportsInterface(0x805f2132), "IReceiver");
    assertTrue(r.supportsInterface(0x01ffc9a7), "IERC165");
    assertFalse(r.supportsInterface(0xffffffff), "ERC165Checker demands false here");
  }

  function test_SupportsInterface_CostsLessThanTheStipend() public {
    MinimalReceiver r = new MinimalReceiver();
    uint256 before = gasleft();
    r.supportsInterface(0x805f2132);
    assertLt(before - gasleft(), 30_000);
  }

  /// @dev The vector is built here and asserted here, which proves Solidity against Solidity.
  ///      Printing it is what lets a second implementation be checked against the same bytes.
  function test_ReportCodec_EmitsTheGoldenVector() public pure {
    console2.logBytes(_goldenVector());
    console2.logBytes(_rejectVector());
  }

  /// @dev Its own nonce: the registry marks a nonce used before it looks at the kind, so a reject
  ///      reusing the record's body reverts as a replay rather than rejecting.
  function _rejectVector() private pure returns (bytes memory) {
    return abi.encode(
      uint8(4), // kind: Reject
      uint64(3_034_092_155_422_581_607),
      bytes32(uint256(0x000CF)), // nonce, distinct from the record's
      bytes32(uint256(0x11E)),
      bytes32(uint256(0x5AB)),
      address(uint160(0xB0110E1)),
      uint128(0),
      uint32(6), // rateBps carries the reason for a Reject: UnauthorizedSubmitter
      uint64(0),
      new bytes32[](0)
    );
  }

  function _goldenVector() private pure returns (bytes memory) {
    return abi.encode(
      uint8(1), // kind: Record
      uint64(3_034_092_155_422_581_607), // chainSelector: Arc Testnet
      bytes32(uint256(0x000CE)), // nonce
      bytes32(uint256(0x11E)), // lienId
      bytes32(uint256(0x5AB)), // submissionId
      address(uint160(0xB0110E1)), // borrower
      uint128(250_000_000), // advanceUsdc6: 250.000000 USDC
      uint32(150), // rateBps: 1.50%
      uint64(1_799_000_000), // expiresAt
      new bytes32[](7) // componentCommitments
    );
  }
}

/// @dev Storage harness for the packing test. Not part of the frozen surface.
contract LienStore {
  ICaplaneRegistry.Lien internal _lien;

  function set(
    ICaplaneRegistry.Lien calldata lien
  ) external {
    _lien = lien;
  }
}
