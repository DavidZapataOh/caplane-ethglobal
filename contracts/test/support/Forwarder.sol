// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Packs the 64 bytes `KeystoneForwarder` slices out of a raw report, in production order:
///      workflowId[0:32] | workflowName[32:42] | workflowOwner[42:62] | reportId[62:64].
contract Forwarder {
  function metadata(
    address workflowOwner,
    bytes10 workflowName
  ) external pure returns (bytes memory) {
    return abi.encodePacked(bytes32(uint256(0xC1D)), workflowName, workflowOwner, bytes2(0x0001));
  }
}
