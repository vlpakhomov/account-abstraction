// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * manage guardians.
 * guardian is trusted address for owner.
 */
interface IGuardianable {
    function addGuardian(address _guardian) external;
    function getGuardians() external view returns (address[] memory);
    function updateGuardians(address[] memory _guardians) external;
    function removeGuardian(address _guardian) external;
}