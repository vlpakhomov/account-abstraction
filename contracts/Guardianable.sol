// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./IGuardianable.sol";

abstract contract Guardianable is IGuardianable {
    modifier onlyOwner() virtual;
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private guardians;

    // add onlyOwner constraint 
    function addGuardian(address _guardian) external onlyOwner {
        require(_guardian != address(0), "Zero address");
        //require(_guardian != owner, "Owner cannot be guardian");
        require(guardians.add(_guardian), "Already guardian");
    }

    function getGuardians() external view onlyOwner returns (address[] memory) {
        return guardians.values();
    }

    function updateGuardians(address[] memory _guardians) public onlyOwner {
        guardians.clear();
        for (uint i = 0; i < _guardians.length; i++) {
            guardians.add(_guardians[i]);
        }
    }

    // add onlyOwner constraint
    function removeGuardian(address _guardian) external onlyOwner {
        require(guardians.remove(_guardian), "Not a guardian");
    }
}

