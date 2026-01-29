# Solidity API

## SimpleAccount

minimal account.
 this is sample minimal account.
 has execute, eth handling methods
 has a single signer that can send requests through the entryPoint.

### Contract
SimpleAccount : contracts/SmartContractWallet.sol

 --- 
### Functions:
### constructor

```solidity
constructor(contract IEntryPoint _entryPoint) public
```

### _requireFromEntryPointOrOwner

```solidity
function _requireFromEntryPointOrOwner() internal view
```

### entryPoint

```solidity
function entryPoint() public view virtual returns (contract IEntryPoint)
```

return the entryPoint used by this account.
subclass should return the current entryPoint used by this account.

### _validateSignature

```solidity
function _validateSignature(struct UserOperation userOp, bytes32 userOpHash) internal virtual returns (uint256 validationData)
```

validate the signature is valid for this message.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| userOp | struct UserOperation | validate the userOp.signature field |
| userOpHash | bytes32 | convenient field: the hash of the request, to check the signature against          (also hashes the entrypoint and chain id) |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| validationData | uint256 | signature and time-range of this operation      <20-byte> sigAuthorizer - 0 for valid signature, 1 to mark signature failure,         otherwise, an address of an "authorizer" contract.      <6-byte> validUntil - last timestamp this operation is valid. 0 for "indefinite"      <6-byte> validAfter - first timestamp this operation is valid      If the account doesn't use time-range, it is enough to return SIG_VALIDATION_FAILED value (1) for signature failure.      Note that the validation code cannot use block.timestamp (or block.number) directly. |

### execute

```solidity
function execute(address dest, uint256 value, bytes func) external
```

execute a transaction (called directly from owner, or by entryPoint)

### _call

```solidity
function _call(address target, uint256 value, bytes data) internal
```

inherits BaseAccount:
### getNonce

```solidity
function getNonce() public view virtual returns (uint256)
```

Return the account nonce.
This method returns the next sequential nonce.
For a nonce of a specific key, use `entrypoint.getNonce(account, key)`

### validateUserOp

```solidity
function validateUserOp(struct UserOperation userOp, bytes32 userOpHash, uint256 missingAccountFunds) external virtual returns (uint256 validationData)
```

Validate user's signature and nonce.
subclass doesn't need to override this method. Instead, it should override the specific internal validation methods.

### _requireFromEntryPoint

```solidity
function _requireFromEntryPoint() internal view virtual
```

ensure the request comes from the known entrypoint.

### _validateNonce

```solidity
function _validateNonce(uint256 nonce) internal view virtual
```

Validate the nonce of the UserOperation.
This method may validate the nonce requirement of this account.
e.g.
To limit the nonce to use sequenced UserOps only (no "out of order" UserOps):
     `require(nonce < type(uint64).max)`
For a hypothetical account that *requires* the nonce to be out-of-order:
     `require(nonce & type(uint64).max == 0)`

The actual nonce uniqueness is managed by the EntryPoint, and thus no other
action is needed by the account itself.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| nonce | uint256 | to validate solhint-disable-next-line no-empty-blocks |

### _payPrefund

```solidity
function _payPrefund(uint256 missingAccountFunds) internal virtual
```

sends to the entrypoint (msg.sender) the missing funds for this transaction.
subclass MAY override this method for better funds management
(e.g. send to the entryPoint more than the minimum required, so that in future transactions
it will not be required to send again)

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| missingAccountFunds | uint256 | the minimum value this method should send the entrypoint.  this value MAY be zero, in case there is enough deposit, or the userOp has a paymaster. |

inherits IAccount:

## BaseAccount

Basic account implementation.
this contract provides the basic logic for implementing the IAccount interface  - validateUserOp
specific account implementation should inherit it and provide the account-specific logic

### Contract
BaseAccount : contracts/core/BaseAccount.sol

 --- 
### Functions:
### getNonce

```solidity
function getNonce() public view virtual returns (uint256)
```

Return the account nonce.
This method returns the next sequential nonce.
For a nonce of a specific key, use `entrypoint.getNonce(account, key)`

### entryPoint

```solidity
function entryPoint() public view virtual returns (contract IEntryPoint)
```

return the entryPoint used by this account.
subclass should return the current entryPoint used by this account.

### validateUserOp

```solidity
function validateUserOp(struct UserOperation userOp, bytes32 userOpHash, uint256 missingAccountFunds) external virtual returns (uint256 validationData)
```

Validate user's signature and nonce.
subclass doesn't need to override this method. Instead, it should override the specific internal validation methods.

### _requireFromEntryPoint

```solidity
function _requireFromEntryPoint() internal view virtual
```

ensure the request comes from the known entrypoint.

### _validateSignature

```solidity
function _validateSignature(struct UserOperation userOp, bytes32 userOpHash) internal virtual returns (uint256 validationData)
```

validate the signature is valid for this message.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| userOp | struct UserOperation | validate the userOp.signature field |
| userOpHash | bytes32 | convenient field: the hash of the request, to check the signature against          (also hashes the entrypoint and chain id) |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| validationData | uint256 | signature and time-range of this operation      <20-byte> sigAuthorizer - 0 for valid signature, 1 to mark signature failure,         otherwise, an address of an "authorizer" contract.      <6-byte> validUntil - last timestamp this operation is valid. 0 for "indefinite"      <6-byte> validAfter - first timestamp this operation is valid      If the account doesn't use time-range, it is enough to return SIG_VALIDATION_FAILED value (1) for signature failure.      Note that the validation code cannot use block.timestamp (or block.number) directly. |

### _validateNonce

```solidity
function _validateNonce(uint256 nonce) internal view virtual
```

Validate the nonce of the UserOperation.
This method may validate the nonce requirement of this account.
e.g.
To limit the nonce to use sequenced UserOps only (no "out of order" UserOps):
     `require(nonce < type(uint64).max)`
For a hypothetical account that *requires* the nonce to be out-of-order:
     `require(nonce & type(uint64).max == 0)`

The actual nonce uniqueness is managed by the EntryPoint, and thus no other
action is needed by the account itself.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| nonce | uint256 | to validate solhint-disable-next-line no-empty-blocks |

### _payPrefund

```solidity
function _payPrefund(uint256 missingAccountFunds) internal virtual
```

sends to the entrypoint (msg.sender) the missing funds for this transaction.
subclass MAY override this method for better funds management
(e.g. send to the entryPoint more than the minimum required, so that in future transactions
it will not be required to send again)

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| missingAccountFunds | uint256 | the minimum value this method should send the entrypoint.  this value MAY be zero, in case there is enough deposit, or the userOp has a paymaster. |

inherits IAccount:

## ValidationData

returned data from validateUserOp.
validateUserOp returns a uint256, with is created by `_packedValidationData` and parsed by `_parseValidationData`

### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |

```solidity
struct ValidationData {
  address aggregator;
  uint48 validAfter;
  uint48 validUntil;
}
```

## freeFunction

```solidity
freeFunction freeFunction(uint256 validationData) internal pure returns (struct ValidationData data)
```

## freeFunction

```solidity
freeFunction freeFunction(uint256 validationData, uint256 paymasterValidationData) internal pure returns (struct ValidationData)
```

## freeFunction

```solidity
freeFunction freeFunction(struct ValidationData data) internal pure returns (uint256)
```

helper to pack the return value for validateUserOp

### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| data | struct ValidationData | - the ValidationData to pack |

## freeFunction

```solidity
freeFunction freeFunction(bool sigFailed, uint48 validUntil, uint48 validAfter) internal pure returns (uint256)
```

helper to pack the return value for validateUserOp, when not using an aggregator

### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sigFailed | bool | - true for signature failure, false for success |
| validUntil | uint48 | last timestamp this UserOperation is valid (or zero for infinite) |
| validAfter | uint48 | first timestamp this UserOperation is valid |

## freeFunction

```solidity
freeFunction freeFunction(bytes data) internal pure returns (bytes32 ret)
```

keccak function over calldata.

_copy calldata into memory, do keccak and drop allocated memory. Strangely, this is more efficient than letting solidity do it._

## IAccount

### Contract
IAccount : contracts/interfaces/IAccount.sol

 --- 
### Functions:
### validateUserOp

```solidity
function validateUserOp(struct UserOperation userOp, bytes32 userOpHash, uint256 missingAccountFunds) external returns (uint256 validationData)
```

Validate user's signature and nonce
the entryPoint will make the call to the recipient only if this validation call returns successfully.
signature failure should be reported by returning SIG_VALIDATION_FAILED (1).
This allows making a "simulation call" without a valid signature
Other failures (e.g. nonce mismatch, or invalid signature format) should still revert to signal failure.

_Must validate caller is the entryPoint.
     Must validate the signature and nonce_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| userOp | struct UserOperation | the operation that is about to be executed. |
| userOpHash | bytes32 | hash of the user's request data. can be used as the basis for signature. |
| missingAccountFunds | uint256 | missing funds on the account's deposit in the entrypoint.      This is the minimum amount to transfer to the sender(entryPoint) to be able to make the call.      The excess is left as a deposit in the entrypoint, for future calls.      can be withdrawn anytime using "entryPoint.withdrawTo()"      In case there is a paymaster in the request (or the current deposit is high enough), this value will be zero. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| validationData | uint256 | packaged ValidationData structure. use `_packValidationData` and `_unpackValidationData` to encode and decode      <20-byte> sigAuthorizer - 0 for valid signature, 1 to mark signature failure,         otherwise, an address of an "authorizer" contract.      <6-byte> validUntil - last timestamp this operation is valid. 0 for "indefinite"      <6-byte> validAfter - first timestamp this operation is valid      If an account doesn't use time-range, it is enough to return SIG_VALIDATION_FAILED value (1) for signature failure.      Note that the validation code cannot use block.timestamp (or block.number) directly. |

## IAggregator

Aggregated Signatures validator.

### Contract
IAggregator : contracts/interfaces/IAggregator.sol

 --- 
### Functions:
### validateSignatures

```solidity
function validateSignatures(struct UserOperation[] userOps, bytes signature) external view
```

validate aggregated signature.
revert if the aggregated signature does not match the given list of operations.

### validateUserOpSignature

```solidity
function validateUserOpSignature(struct UserOperation userOp) external view returns (bytes sigForUserOp)
```

validate signature of a single userOp
This method is should be called by bundler after EntryPoint.simulateValidation() returns (reverts) with ValidationResultWithAggregation
First it validates the signature over the userOp. Then it returns data to be used when creating the handleOps.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| userOp | struct UserOperation | the userOperation received from the user. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| sigForUserOp | bytes | the value to put into the signature field of the userOp when calling handleOps.    (usually empty, unless account and aggregator support some kind of "multisig" |

### aggregateSignatures

```solidity
function aggregateSignatures(struct UserOperation[] userOps) external view returns (bytes aggregatedSignature)
```

aggregate multiple signatures into a single value.
This method is called off-chain to calculate the signature to pass with handleOps()
bundler MAY use optimized custom code perform this aggregation

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| userOps | struct UserOperation[] | array of UserOperations to collect the signatures from. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| aggregatedSignature | bytes | the aggregated signature |

## IEntryPoint

### Contract
IEntryPoint : contracts/interfaces/IEntryPoint.sol

 --- 
### Functions:
### handleOps

```solidity
function handleOps(struct UserOperation[] ops, address payable beneficiary) external
```

Execute a batch of UserOperation.
no signature aggregator is used.
if any account requires an aggregator (that is, it returned an aggregator when
performing simulateValidation), then handleAggregatedOps() must be used instead.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| ops | struct UserOperation[] | the operations to execute |
| beneficiary | address payable | the address to receive the fees |

### handleAggregatedOps

```solidity
function handleAggregatedOps(struct IEntryPoint.UserOpsPerAggregator[] opsPerAggregator, address payable beneficiary) external
```

Execute a batch of UserOperation with Aggregators

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| opsPerAggregator | struct IEntryPoint.UserOpsPerAggregator[] | the operations to execute, grouped by aggregator (or address(0) for no-aggregator accounts) |
| beneficiary | address payable | the address to receive the fees |

### getUserOpHash

```solidity
function getUserOpHash(struct UserOperation userOp) external view returns (bytes32)
```

generate a request Id - unique identifier for this request.
the request ID is a hash over the content of the userOp (except the signature), the entrypoint and the chainid.

### simulateValidation

```solidity
function simulateValidation(struct UserOperation userOp) external
```

Simulate a call to account.validateUserOp and paymaster.validatePaymasterUserOp.

_this method always revert. Successful result is ValidationResult error. other errors are failures.
The node must also verify it doesn't use banned opcodes, and that it doesn't reference storage outside the account's data._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| userOp | struct UserOperation | the user operation to validate. |

### getSenderAddress

```solidity
function getSenderAddress(bytes initCode) external
```

Get counterfactual sender address.
 Calculate the sender contract address that will be generated by the initCode and salt in the UserOperation.
this method always revert, and returns the address in SenderAddressResult error

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| initCode | bytes | the constructor code to be passed into the UserOperation. |

### simulateHandleOp

```solidity
function simulateHandleOp(struct UserOperation op, address target, bytes targetCallData) external
```

simulate full execution of a UserOperation (including both validation and target execution)
this method will always revert with "ExecutionResult".
it performs full validation of the UserOperation, but ignores signature error.
an optional target address is called after the userop succeeds, and its value is returned
(before the entire call is reverted)
Note that in order to collect the the success/failure of the target call, it must be executed
with trace enabled to track the emitted events.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| op | struct UserOperation | the UserOperation to simulate |
| target | address | if nonzero, a target address to call after userop simulation. If called, the targetSuccess and targetResult        are set to the return from that call. |
| targetCallData | bytes | callData to pass to target address |

inherits INonceManager:
### getNonce

```solidity
function getNonce(address sender, uint192 key) external view returns (uint256 nonce)
```

Return the next nonce for this sender.
Within a given key, the nonce values are sequenced (starting with zero, and incremented by one on each userop)
But UserOp with different keys can come with arbitrary order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sender | address | the account address |
| key | uint192 | the high 192 bit of the nonce |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| nonce | uint256 | a full nonce to pass for next UserOp with this sender. |

### incrementNonce

```solidity
function incrementNonce(uint192 key) external
```

Manually increment the nonce of the sender.
This method is exposed just for completeness..
Account does NOT need to call it, neither during validation, nor elsewhere,
as the EntryPoint will update the nonce regardless.
Possible use-case is call it with various keys to "initialize" their nonces to one, so that future
UserOperations will not pay extra for the first transaction with a given key.

inherits IStakeManager:
### getDepositInfo

```solidity
function getDepositInfo(address account) external view returns (struct IStakeManager.DepositInfo info)
```

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| info | struct IStakeManager.DepositInfo | - full deposit information of given account |

### balanceOf

```solidity
function balanceOf(address account) external view returns (uint256)
```

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the deposit (for gas payment) of the account |

### depositTo

```solidity
function depositTo(address account) external payable
```

add to the deposit of the given account

### addStake

```solidity
function addStake(uint32 _unstakeDelaySec) external payable
```

add to the account's stake - amount and delay
any pending unstake is first cancelled.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _unstakeDelaySec | uint32 | the new lock duration before the deposit can be withdrawn. |

### unlockStake

```solidity
function unlockStake() external
```

attempt to unlock the stake.
the value can be withdrawn (using withdrawStake) after the unstake delay.

### withdrawStake

```solidity
function withdrawStake(address payable withdrawAddress) external
```

withdraw from the (unlocked) stake.
must first call unlockStake and wait for the unstakeDelay to pass

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| withdrawAddress | address payable | the address to send withdrawn value. |

### withdrawTo

```solidity
function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external
```

withdraw from the deposit.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| withdrawAddress | address payable | the address to send withdrawn value. |
| withdrawAmount | uint256 | the amount to withdraw. |

 --- 
### Events:
### UserOperationEvent

```solidity
event UserOperationEvent(bytes32 userOpHash, address sender, address paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)
```

### AccountDeployed

```solidity
event AccountDeployed(bytes32 userOpHash, address sender, address factory, address paymaster)
```

account "sender" was deployed.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| userOpHash | bytes32 | the userOp that deployed this account. UserOperationEvent will follow. |
| sender | address | the account that is deployed |
| factory | address | the factory used to deploy this account (in the initCode) |
| paymaster | address | the paymaster used by this UserOp |

### UserOperationRevertReason

```solidity
event UserOperationRevertReason(bytes32 userOpHash, address sender, uint256 nonce, bytes revertReason)
```

An event emitted if the UserOperation "callData" reverted with non-zero length

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| userOpHash | bytes32 | the request unique identifier. |
| sender | address | the sender of this request |
| nonce | uint256 | the nonce used in the request |
| revertReason | bytes | - the return bytes from the (reverted) call to "callData". |

### BeforeExecution

```solidity
event BeforeExecution()
```

an event emitted by handleOps(), before starting the execution loop.
any event emitted before this event, is part of the validation.

### SignatureAggregatorChanged

```solidity
event SignatureAggregatorChanged(address aggregator)
```

signature aggregator used by the following UserOperationEvents within this bundle.

inherits INonceManager:
inherits IStakeManager:
### Deposited

```solidity
event Deposited(address account, uint256 totalDeposit)
```

### Withdrawn

```solidity
event Withdrawn(address account, address withdrawAddress, uint256 amount)
```

### StakeLocked

```solidity
event StakeLocked(address account, uint256 totalStaked, uint256 unstakeDelaySec)
```

Emitted when stake or unstake delay are modified

### StakeUnlocked

```solidity
event StakeUnlocked(address account, uint256 withdrawTime)
```

Emitted once a stake is scheduled for withdrawal

### StakeWithdrawn

```solidity
event StakeWithdrawn(address account, address withdrawAddress, uint256 amount)
```

## INonceManager

### Contract
INonceManager : contracts/interfaces/INonceManager.sol

 --- 
### Functions:
### getNonce

```solidity
function getNonce(address sender, uint192 key) external view returns (uint256 nonce)
```

Return the next nonce for this sender.
Within a given key, the nonce values are sequenced (starting with zero, and incremented by one on each userop)
But UserOp with different keys can come with arbitrary order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sender | address | the account address |
| key | uint192 | the high 192 bit of the nonce |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| nonce | uint256 | a full nonce to pass for next UserOp with this sender. |

### incrementNonce

```solidity
function incrementNonce(uint192 key) external
```

Manually increment the nonce of the sender.
This method is exposed just for completeness..
Account does NOT need to call it, neither during validation, nor elsewhere,
as the EntryPoint will update the nonce regardless.
Possible use-case is call it with various keys to "initialize" their nonces to one, so that future
UserOperations will not pay extra for the first transaction with a given key.

## IStakeManager

manage deposits and stakes.
deposit is just a balance used to pay for UserOperations (either by a paymaster or an account)
stake is value locked for at least "unstakeDelay" by the staked entity.

### Contract
IStakeManager : contracts/interfaces/IStakeManager.sol

 --- 
### Functions:
### getDepositInfo

```solidity
function getDepositInfo(address account) external view returns (struct IStakeManager.DepositInfo info)
```

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| info | struct IStakeManager.DepositInfo | - full deposit information of given account |

### balanceOf

```solidity
function balanceOf(address account) external view returns (uint256)
```

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the deposit (for gas payment) of the account |

### depositTo

```solidity
function depositTo(address account) external payable
```

add to the deposit of the given account

### addStake

```solidity
function addStake(uint32 _unstakeDelaySec) external payable
```

add to the account's stake - amount and delay
any pending unstake is first cancelled.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _unstakeDelaySec | uint32 | the new lock duration before the deposit can be withdrawn. |

### unlockStake

```solidity
function unlockStake() external
```

attempt to unlock the stake.
the value can be withdrawn (using withdrawStake) after the unstake delay.

### withdrawStake

```solidity
function withdrawStake(address payable withdrawAddress) external
```

withdraw from the (unlocked) stake.
must first call unlockStake and wait for the unstakeDelay to pass

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| withdrawAddress | address payable | the address to send withdrawn value. |

### withdrawTo

```solidity
function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external
```

withdraw from the deposit.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| withdrawAddress | address payable | the address to send withdrawn value. |
| withdrawAmount | uint256 | the amount to withdraw. |

 --- 
### Events:
### Deposited

```solidity
event Deposited(address account, uint256 totalDeposit)
```

### Withdrawn

```solidity
event Withdrawn(address account, address withdrawAddress, uint256 amount)
```

### StakeLocked

```solidity
event StakeLocked(address account, uint256 totalStaked, uint256 unstakeDelaySec)
```

Emitted when stake or unstake delay are modified

### StakeUnlocked

```solidity
event StakeUnlocked(address account, uint256 withdrawTime)
```

Emitted once a stake is scheduled for withdrawal

### StakeWithdrawn

```solidity
event StakeWithdrawn(address account, address withdrawAddress, uint256 amount)
```

## UserOperation

User Operation struct

### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |

```solidity
struct UserOperation {
  address sender;
  uint256 nonce;
  bytes initCode;
  bytes callData;
  uint256 callGasLimit;
  uint256 verificationGasLimit;
  uint256 preVerificationGas;
  uint256 maxFeePerGas;
  uint256 maxPriorityFeePerGas;
  bytes paymasterAndData;
  bytes signature;
}
```

## UserOperationLib

Utility functions helpful when working with UserOperation structs.

### Contract
UserOperationLib : contracts/interfaces/UserOperation.sol

 --- 
### Functions:
### getSender

```solidity
function getSender(struct UserOperation userOp) internal pure returns (address)
```

### gasPrice

```solidity
function gasPrice(struct UserOperation userOp) internal view returns (uint256)
```

### pack

```solidity
function pack(struct UserOperation userOp) internal pure returns (bytes ret)
```

### hash

```solidity
function hash(struct UserOperation userOp) internal pure returns (bytes32)
```

### min

```solidity
function min(uint256 a, uint256 b) internal pure returns (uint256)
```

