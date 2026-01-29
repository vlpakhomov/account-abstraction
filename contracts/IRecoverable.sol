// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

interface IRecoverable {   
    /**
     * @notice Schedules a recovery operation for a wallet
     * @param newOwner The new owner to be set for the wallet
     * @param rawGuardian The raw guardian data
     * @param guardianSignature The signature of the guardian
     * @return recoveryId The ID of the recovery operation
     */
    function scheduleRecovery(
        address newOwner,
        bytes calldata rawGuardian,
        bytes calldata guardianSignature
    ) external returns (bytes32);

    function executeRecovery(address newOwner) external;

    //function setGuardian(bytes32 newGuardianHash) external;
    //function setDelayPeriod(uint256 newDelay) external;

    enum RecoveryStatus {
        Unset,
        Waiting,
        Ready,
        Done
    }

    /**
     * gas and return values during simulation
     * @param guardianHash the gas used for validation (including preValidationGas)
     * @param nonce the required prefund for this operation
     * @param operationValidAt validateUserOp's (or paymaster's) signature check failed
     * @param delayPeriod validateUserOp's (or paymaster's) signature check failed
     */
    struct RecoverConfig {
        bytes32 guardianHash;
        uint256 nonce;
        // id to operation valid time
        mapping(bytes32 id => uint256) operationValidAt;
        uint256 delayPeriod;
    }

    /**
     * gas and return values during simulation
     * @param guardians the gas used for validation (including preValidationGas)
     * @param threshold the required prefund for this operation
     * @param salt validateUserOp's (or paymaster's) signature check failed
     */
    struct GuardianData {
        address[] guardians;
        uint256 threshold;
        uint256 salt;
    }
}
