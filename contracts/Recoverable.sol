// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import {IRecoverable} from "./IRecoverable.sol";
import {Guardianable} from "./Guardianable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

abstract contract Recoverable is Initializable, EIP712Upgradeable, IRecoverable {
    function _setSmartWalletOwner(address newOwner) internal virtual;
    event DebugGuardian(uint256 index, address expected, address recovered, uint8 v, bytes32 r, bytes32 s);

    using ECDSA for bytes32;

    string public constant NAME = "Social Recovery Module";
    string public constant VERSION = "0.0.1";

    // guardian data
    Guardianable public guardianable;
    uint256 threshold;

    // uneccesary field
    // uint256 salt;

    uint256 public nonce;
    uint256 public delayPeriod;

    mapping(bytes32 => uint256) recoveryIDToExpiredAt;
    mapping(bytes32 => bool) public approvedHashes;
    uint256 internal constant _DONE_TIMESTAMP = uint256(1);
    bytes32 private constant TYPE_HASH = keccak256("Recovery(uint256 nonce,address newOwner)");

    function __Recoverable_init() internal onlyInitializing {
        __EIP712_init(NAME, VERSION);
        guardianable = Guardianable(address(this));
        nonce = 0;
    }

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
    ) external returns (bytes32) {
        bytes32 recoveryID = hashRecovery(nonce, abi.encode(newOwner, guardianable.getGuardians()));
        require(!isRecoveryCompleted(recoveryID), "this recovery is completed");
        GuardianData memory data = _parseGuardianData(rawGuardian);
        require(_checkGuardians(data.guardians), "invalid guardians");
        _verifyGuardianSignature(newOwner, rawGuardian, guardianSignature);
        uint256 expiredAt = block.timestamp + delayPeriod;
        recoveryIDToExpiredAt[recoveryID] = expiredAt;
        return recoveryID;
    }

    /**
     * @notice Executes a recovery operation for a wallet
     * @param newOwner The new owner to be set for the wallet
     */
    function executeRecovery(address newOwner) external {
        bytes32 recoveryID = hashRecovery(nonce, abi.encode(newOwner, guardianable.getGuardians()));
        require(!isRecoveryReadied(recoveryID), "this recovery isn't readied");
        recoveryIDToExpiredAt[recoveryID] = _DONE_TIMESTAMP;
        nonce++;
        _setSmartWalletOwner(newOwner);
    }


    /**
     * @notice Verifies the guardian's signature
     * @dev This function checks the signature type and verifies it accordingly. It supports EIP-1271 signatures for smart contract wallet, approved hashes, and EOA signatures.
     */
    function _verifyGuardianSignature(address newOwner, bytes calldata _data, bytes calldata _signature) internal  {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(TYPE_HASH, nonce, newOwner)));

        GuardianData memory guardianData = _parseGuardianData(_data);

        uint256 guardiansLength = guardianData.guardians.length;

        require(guardiansLength > 0, "guardian array length invalid");
        require(guardianData.threshold > 0, "guardian threshold invalid");

        // for extreme cases
        if (guardianData.threshold > guardiansLength) guardianData.threshold = guardiansLength;

        /*
        keySignature structure:
        ┌──────────────┬──────────────┬──────────────┬──────────────┐
        │              │              │              │              │
        │   signature1 │   signature2 │      ...     │   signatureN │
        │              │              │              │              │
        └──────────────┴──────────────┴──────────────┴──────────────┘

        one signature structure:
        ┌──────────┬──────────────┬──────────┬────────────────┐
        │          │              │          │                │
        │    v     │       s      │   r      │  dynamic data  │
        │  bytes1  │bytes4|bytes32│  bytes32 │     dynamic    │
        │  (must)  │  (optional)  │(optional)│   (optional)   │
        └──────────┴──────────────┴──────────┴────────────────┘

        data logic description:
            v = 0
                EIP-1271 signature
                s: bytes4 Length of signature data
                r: no set
                dynamic data: signature data

            v = 1
                approved hash
                r: no set
                s: no set

            v = 2
                skip
                s: bytes4 skip times
                r: no set

            v > 2
                EOA signature
                r: bytes32
                s: bytes32

        ==============================================================
        Note: Why is the definition of 's' unstable (bytes4|bytes32)?
              If 's' is defined as bytes32, it incurs lower read costs( shr(224, calldataload() -> calldataload() ). However, to prevent arithmetic overflow, all calculations involving 's' need to be protected against overflow, which leads to higher overhead.
              If, in certain cases, 's' is defined as bytes4 (up to 4GB), there is no need to perform overflow prevention under the current known block gas limit.
              Overall, it is more suitable for both Layer1 and Layer2.
     */
        uint256 cursor = 0;
        uint256 skipCount = 0;
        uint256 guardiansSignatureLength = _signature.length;

        for (uint256 i = 0; i < guardiansLength;) {
            if (cursor >= guardiansSignatureLength) break;
            uint8 v = uint8(_signature[cursor]);

            if (v == 0) {
                /*
                    v = 0
                    EIP-1271 signature
                    s: bytes4 Length of signature data
                    r: no set
                    dynamic data: signature data
                */

                uint256 signatureLength = uint256(uint32(bytes4(_signature[cursor + 1 : cursor + 5])));

                bytes calldata signatureData = _signature[cursor + 5 : cursor + 5 + signatureLength];

                // Verify EIP-1271 signature
                (bool success, bytes memory result) = guardianData.guardians[i].staticcall(
                    abi.encodeWithSelector(
                        IERC1271.isValidSignature.selector, 
                        digest, 
                        signatureData
                    )
                );

                require(success && result.length == 32 && abi.decode(result, (bytes32)) == bytes32(IERC1271.isValidSignature.selector), 
                    "contract signature invalid");
                
                cursor += 5 + signatureLength;
            } else if (v == 1) {
                /*
                    v = 1
                    approved hash
                    r: no set
                    s: no set
                */

                bytes32 key = _approveKey(guardianData.guardians[i], digest);
                require(approvedHashes[key], "hash not approved");

                cursor += 1; 
            } else if (v == 2) {
                /*
                    v = 2
                    skip
                    s: bytes4 skip times
                    r: no set
                 */

                uint256 skipTimes = uint256(uint32(bytes4(_signature[cursor + 1 : cursor + 5])));
            
                i += skipTimes;
                skipCount += skipTimes + 1; // +1 for the current skip entry
            
                cursor += 5;
            } else {
                /*
                    v > 2
                    EOA signature
                */
                
                bytes32 r = bytes32(_signature[cursor + 1 : cursor + 33]);
                bytes32 s = bytes32(_signature[cursor + 33 : cursor + 65]);
                
                emit DebugGuardian(i, guardianData.guardians[i], ECDSA.recover(digest, v, r, s), v, r, s);
                require(guardianData.guardians[i] == ECDSA.recover(digest, v, r, s), "guardian signature invalid");
                
                cursor += 65;
            }
            i++; // see Note line 282
        }

        require(guardiansLength - skipCount >= guardianData.threshold, "guardian signature invalid");
    }

    /**
     * @notice Approves a hash for the sender
     * the hash is the eip712 hash of the recover operation for guardian to sign
     * @dev Considering that not all contracts are EIP-1271 compatible, this function could be called by the guardian if the guardian is a smart contract.
     * It emits an ApproveHash event.
     * @param hash The hash to be approved
     */
    function approveHash(bytes32 hash) external {
        bytes32 key = _approveKey(msg.sender, hash);
        require(approvedHashes[key], "Already approved");
        approvedHashes[key] = true;
    }

    function _approveKey(address sender, bytes32 hash) private pure returns (bytes32) {
        return keccak256(abi.encode(sender, hash));
    }

    function setThreshold(uint256 _threshold) external {
        threshold = _threshold;
        nonce++;
    }

    function getThreshold() external view returns (uint256) {
        return threshold;
    }

    function getDelayPeriod() external view returns (uint256) {
        return delayPeriod;
    }

    function setDelayPeriod(uint256 _delayPeriod) external {
        delayPeriod = _delayPeriod;
        nonce++;
    }

    /**
     * @param   _nonce  Add a nonce for the hash operation. When recovery is cancelled or the guardian is modified, the nonce can automatically invalidate the previous operation
     * @return  bytes32  return recoveryID
     */
    function hashRecovery(uint256 _nonce, bytes memory _data) internal view virtual returns (bytes32) {
        return keccak256(abi.encode(_nonce, _data, address(this), block.chainid));
    }

    /**
     * @dev Returns whether an id corresponds to a registered operation. This
     * includes both Waiting, Ready, and Done operations.
     */
    function isRecoveryCompleted(bytes32 id) public view returns (bool) {
        return getRecoveryStatus(id) != RecoveryStatus.Unset;
    }

    /**
     * @dev Returns whether an operation is ready for execution. Note that a "ready" operation is also "pending".
     */
    function isRecoveryReadied(bytes32 id) public view returns (bool) {
        return getRecoveryStatus(id) == RecoveryStatus.Ready;
    }

    function getRecoveryStatus(bytes32 recoveryID) public view returns (RecoveryStatus) {
        uint256 expirationTime = recoveryIDToExpiredAt[recoveryID];
        if (expirationTime == 0) {
            return RecoveryStatus.Unset;
        } else if (expirationTime == _DONE_TIMESTAMP) {
            return RecoveryStatus.Done;
        } else if (expirationTime > block.timestamp) {
            return RecoveryStatus.Waiting;
        } else {
            return RecoveryStatus.Ready;
        }
    }

    function _checkGuardians(address[] memory _guardians) internal view returns (bool) {
        address[] memory guardians = guardianable.getGuardians();
        if (_guardians.length != guardians.length) {
            return false;
        }

        for (uint256 i = 0; i < _guardians.length; i++) {
            if (_guardians[i] != guardians[i]) {
                return false;
            }
        }

        return true;
    }

    function _parseGuardianData(bytes calldata _guardianHash) internal pure returns (GuardianData memory) {
        (address[] memory guardians, uint256 threshold, uint256 salt) =
            abi.decode(_guardianHash, (address[], uint256, uint256));
        return GuardianData({guardians: guardians, threshold: threshold, salt: salt});
    }
}