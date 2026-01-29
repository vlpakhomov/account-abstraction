import './aa.init'
import { BigNumber, Event, Wallet } from 'ethers'
import { expect } from 'chai'
import {
  EntryPoint,
  SmartContractWallet,
  SmartContractWalletFactory,
  TestCounter,
  TestCounter__factory,
  TestExpiryAccount,
  TestExpiryAccount__factory,
  TestRevertAccount__factory,
  MaliciousAccount__factory,
  TestWarmColdAccount__factory
} from '../typechain'
import {
  AddressZero,
  createAccountOwner,
  fund,
  checkForGeth,
  rethrow,
  tostr,
  getAccountInitCode,
  calcGasUsage,
  checkForBannedOps,
  ONE_ETH,
  TWO_ETH,
  deployEntryPoint,
  getBalance,
  createAddress,
  getAccountAddress,
  simulationResultCatch,
  createAccount,
  decodeRevertReason
} from './testutils'
import { DefaultsForUserOp, fillAndSign, getUserOpHash } from './UserOp'
import { UserOperation } from './UserOperation'
import { PopulatedTransaction } from 'ethers/lib/ethers'
import { ethers } from 'hardhat'
import { arrayify, defaultAbiCoder, hexConcat, hexZeroPad, parseEther } from 'ethers/lib/utils'
import { debugTransaction } from './debugTx'
import { toChecksumAddress } from 'ethereumjs-util'

describe('EntryPoint', function () {
  let entryPoint: EntryPoint
  let smartContractWalletFactory: SmartContractWalletFactory

  let accountOwner: Wallet
  const ethersSigner = ethers.provider.getSigner()
  let account: SmartContractWallet

  const globalUnstakeDelaySec = 2
  const paymasterStake = ethers.utils.parseEther('2')

  before(async function () {
    this.timeout(20000)
    await checkForGeth()

    const chainId = await ethers.provider.getNetwork().then(net => net.chainId)

    entryPoint = await deployEntryPoint()

    accountOwner = createAccountOwner();
    ({
      proxy: account,
      accountFactory: smartContractWalletFactory
    } = await createAccount(ethersSigner, await accountOwner.getAddress(), entryPoint.address))
    await fund(account)

    // sanity: validate helper functions
    const sampleOp = await fillAndSign({ sender: account.address }, accountOwner, entryPoint)
    expect(getUserOpHash(sampleOp, entryPoint.address, chainId)).to.eql(await entryPoint.getUserOpHash(sampleOp))
  })

  describe('Stake Management', () => {
    let addr: string
    before(async () => {
      addr = await ethersSigner.getAddress()
    })

    it('should deposit for transfer into EntryPoint', async () => {
      const signer2 = ethers.provider.getSigner(2)
      await signer2.sendTransaction({ to: entryPoint.address, value: ONE_ETH })
      expect(await entryPoint.balanceOf(await signer2.getAddress())).to.eql(ONE_ETH)
      expect(await entryPoint.getDepositInfo(await signer2.getAddress())).to.eql({
        deposit: ONE_ETH,
        staked: false,
        stake: 0,
        unstakeDelaySec: 0,
        withdrawTime: 0
      })
    })

    describe('without stake', () => {
      it('should fail to stake without value', async () => {
        await expect(entryPoint.addStake(2)).to.revertedWith('no stake specified')
      })
      it('should fail to stake without delay', async () => {
        await expect(entryPoint.addStake(0, { value: ONE_ETH })).to.revertedWith('must specify unstake delay')
      })
      it('should fail to unlock', async () => {
        await expect(entryPoint.unlockStake()).to.revertedWith('not staked')
      })
    })
    describe('with stake of 2 eth', () => {
      before(async () => {
        await entryPoint.addStake(2, { value: TWO_ETH })
      })
      it('should report "staked" state', async () => {
        const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(addr)
        expect({ stake, staked, unstakeDelaySec, withdrawTime }).to.eql({
          stake: parseEther('2'),
          staked: true,
          unstakeDelaySec: 2,
          withdrawTime: 0
        })
      })

      it('should succeed to stake again', async () => {
        const { stake } = await entryPoint.getDepositInfo(addr)
        await entryPoint.addStake(2, { value: ONE_ETH })
        const { stake: stakeAfter } = await entryPoint.getDepositInfo(addr)
        expect(stakeAfter).to.eq(stake.add(ONE_ETH))
      })
      it('should fail to withdraw before unlock', async () => {
        await expect(entryPoint.withdrawStake(AddressZero)).to.revertedWith('must call unlockStake() first')
      })
      describe('with unlocked stake', () => {
        before(async () => {
          await entryPoint.unlockStake()
        })
        it('should report as "not staked"', async () => {
          expect(await entryPoint.getDepositInfo(addr).then(info => info.staked)).to.eq(false)
        })
        it('should report unstake state', async () => {
          const withdrawTime1 = await ethers.provider.getBlock('latest').then(block => block.timestamp) + globalUnstakeDelaySec
          const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(addr)
          expect({ stake, staked, unstakeDelaySec, withdrawTime }).to.eql({
            stake: parseEther('3'),
            staked: false,
            unstakeDelaySec: 2,
            withdrawTime: withdrawTime1
          })
        })
        it('should fail to withdraw before unlock timeout', async () => {
          await expect(entryPoint.withdrawStake(AddressZero)).to.revertedWith('Stake withdrawal is not due')
        })
        it('should fail to unlock again', async () => {
          await expect(entryPoint.unlockStake()).to.revertedWith('already unstaking')
        })
        describe('after unstake delay', () => {
          before(async () => {
            // dummy transaction and increase time by 2 seconds
            await ethers.provider.send('evm_increaseTime', [2])
            await ethersSigner.sendTransaction({ to: addr })
          })
          it('adding stake should reset "unlockStake"', async () => {
            let snap
            try {
              snap = await ethers.provider.send('evm_snapshot', [])

              await ethersSigner.sendTransaction({ to: addr })
              await entryPoint.addStake(2, { value: ONE_ETH })
              const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(addr)
              expect({ stake, staked, unstakeDelaySec, withdrawTime }).to.eql({
                stake: parseEther('4'),
                staked: true,
                unstakeDelaySec: 2,
                withdrawTime: 0
              })
            } finally {
              await ethers.provider.send('evm_revert', [snap])
            }
          })

          it('should fail to unlock again', async () => {
            await expect(entryPoint.unlockStake()).to.revertedWith('already unstaking')
          })
          it('should succeed to withdraw', async () => {
            const { stake } = await entryPoint.getDepositInfo(addr)
            const addr1 = createAddress()
            await entryPoint.withdrawStake(addr1)
            expect(await ethers.provider.getBalance(addr1)).to.eq(stake)
            const { stake: stakeAfter, withdrawTime, unstakeDelaySec } = await entryPoint.getDepositInfo(addr)

            expect({ stakeAfter, withdrawTime, unstakeDelaySec }).to.eql({
              stakeAfter: BigNumber.from(0),
              unstakeDelaySec: 0,
              withdrawTime: 0
            })
          })
        })
      })
    })
    describe('with deposit', () => {
      let account: SmartContractWallet
      before(async () => {
        ({ proxy: account } = await createAccount(ethersSigner, await ethersSigner.getAddress(), entryPoint.address, smartContractWalletFactory))
        await account.addDeposit({ value: ONE_ETH })
        expect(await getBalance(account.address)).to.equal(0)
        expect(await account.getDeposit()).to.eql(ONE_ETH)
      })
      it('should be able to withdraw', async () => {
        const depositBefore = await account.getDeposit()
        await account.withdrawDepositTo(account.address, ONE_ETH)
        expect(await getBalance(account.address)).to.equal(1e18)
        expect(await account.getDeposit()).to.equal(depositBefore.sub(ONE_ETH))
      })
    })
  })

  describe('#simulateValidation', () => {
    const accountOwner1 = createAccountOwner()
    let account1: SmartContractWallet

    before(async () => {
      ({ proxy: account1 } = await createAccount(ethersSigner, await accountOwner1.getAddress(), entryPoint.address))
    })

    it('should fail if validateUserOp fails', async () => {
      // using wrong nonce
      const op = await fillAndSign({ sender: account.address, nonce: 1234 }, accountOwner, entryPoint)
      await expect(entryPoint.callStatic.simulateValidation(op)).to
        .revertedWith('AA25 invalid account nonce')
    })

    it('should report signature failure without revert', async () => {
      // (this is actually a feature of the wallet, not the entrypoint)
      // using wrong owner for account1
      // (zero gas price so it doesn't fail on prefund)
      const op = await fillAndSign({ sender: account1.address, maxFeePerGas: 0 }, accountOwner, entryPoint)
      const { returnInfo } = await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
      expect(returnInfo.sigFailed).to.be.true
    })

    it('should revert if wallet not deployed (and no initcode)', async () => {
      const op = await fillAndSign({
        sender: createAddress(),
        nonce: 0,
        verificationGasLimit: 1000
      }, accountOwner, entryPoint)
      await expect(entryPoint.callStatic.simulateValidation(op)).to
        .revertedWith('AA20 account not deployed')
    })

    it('should revert on oog if not enough verificationGas', async () => {
      const op = await fillAndSign({ sender: account.address, verificationGasLimit: 1000 }, accountOwner, entryPoint)
      await expect(entryPoint.callStatic.simulateValidation(op)).to
        .revertedWith('AA23 reverted (or OOG)')
    })

    it('should succeed if validateUserOp succeeds', async () => {
      const op = await fillAndSign({ sender: account1.address }, accountOwner1, entryPoint)
      await fund(account1)
      await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
    })

    it('should return empty context if no paymaster', async () => {
      const op = await fillAndSign({ sender: account1.address, maxFeePerGas: 0 }, accountOwner1, entryPoint)
      const { returnInfo } = await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
      expect(returnInfo.paymasterContext).to.eql('0x')
    })

    it('should return stake of sender', async () => {
      const stakeValue = BigNumber.from(123)
      const unstakeDelay = 3
      const { proxy: account2 } = await createAccount(ethersSigner, await ethersSigner.getAddress(), entryPoint.address)
      await fund(account2)
      await account2.execute(entryPoint.address, stakeValue, entryPoint.interface.encodeFunctionData('addStake', [unstakeDelay]))
      const op = await fillAndSign({ sender: account2.address }, ethersSigner, entryPoint)
      const result = await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
      expect(result.senderInfo).to.eql({ stake: stakeValue, unstakeDelaySec: unstakeDelay })
    })

    it('should prevent overflows: fail if any numeric value is more than 120 bits', async () => {
      const op = await fillAndSign({
        preVerificationGas: BigNumber.from(2).pow(130),
        sender: account1.address
      }, accountOwner1, entryPoint)
      await expect(
        entryPoint.callStatic.simulateValidation(op)
      ).to.revertedWith('gas values overflow')
    })

    it('should fail creation for wrong sender', async () => {
      const op1 = await fillAndSign({
        initCode: getAccountInitCode(accountOwner1.address, smartContractWalletFactory),
        sender: '0x'.padEnd(42, '1'),
        verificationGasLimit: 3e6
      }, accountOwner1, entryPoint)
      await expect(entryPoint.callStatic.simulateValidation(op1))
        .to.revertedWith('AA14 initCode must return sender')
    })

    it('should report failure on insufficient verificationGas (OOG) for creation', async () => {
      const initCode = getAccountInitCode(accountOwner1.address, smartContractWalletFactory)
      const sender = await entryPoint.callStatic.getSenderAddress(initCode).catch(e => e.errorArgs.sender)
      const op0 = await fillAndSign({
        initCode,
        sender,
        verificationGasLimit: 5e5,
        maxFeePerGas: 0
      }, accountOwner1, entryPoint)
      // must succeed with enough verification gas.
      await expect(entryPoint.callStatic.simulateValidation(op0, { gasLimit: 1e6 }))
        .to.revertedWith('ValidationResult')

      const op1 = await fillAndSign({
        initCode,
        sender,
        verificationGasLimit: 1e5,
        maxFeePerGas: 0
      }, accountOwner1, entryPoint)
      await expect(entryPoint.callStatic.simulateValidation(op1, { gasLimit: 1e6 }))
        .to.revertedWith('AA13 initCode failed or OOG')
    })

    it('should succeed for creating an account', async () => {
      const sender = await getAccountAddress(accountOwner1.address, smartContractWalletFactory)
      const op1 = await fillAndSign({
        sender,
        initCode: getAccountInitCode(accountOwner1.address, smartContractWalletFactory)
      }, accountOwner1, entryPoint)
      await fund(op1.sender)

      await entryPoint.callStatic.simulateValidation(op1).catch(simulationResultCatch)
    })

    it('should not call initCode from entrypoint', async () => {
      // a possible attack: call an account's execFromEntryPoint through initCode. This might lead to stolen funds.
      const { proxy: account } = await createAccount(ethersSigner, await accountOwner.getAddress(), entryPoint.address)
      const sender = createAddress()
      const op1 = await fillAndSign({
        initCode: hexConcat([
          account.address,
          account.interface.encodeFunctionData('execute', [sender, 0, '0x'])
        ]),
        sender
      }, accountOwner, entryPoint)
      const error = await entryPoint.callStatic.simulateValidation(op1).catch(e => e)
      expect(error.message).to.match(/initCode failed or OOG/, error)
    })

    it('should not use banned ops during simulateValidation', async () => {
      const op1 = await fillAndSign({
        initCode: getAccountInitCode(accountOwner1.address, smartContractWalletFactory),
        sender: await getAccountAddress(accountOwner1.address, smartContractWalletFactory)
      }, accountOwner1, entryPoint)
      await fund(op1.sender)
      await entryPoint.simulateValidation(op1, { gasLimit: 10e6 }).catch(e => e)
      const block = await ethers.provider.getBlock('latest')
      const hash = block.transactions[0]
      await checkForBannedOps(hash, false)
    })
  })

  describe('#simulateHandleOp', () => {
    it('should simulate execution', async () => {
      const accountOwner1 = createAccountOwner()
      const { proxy: account } = await createAccount(ethersSigner, await accountOwner.getAddress(), entryPoint.address)
      await fund(account)
      const counter = await new TestCounter__factory(ethersSigner).deploy()

      const count = counter.interface.encodeFunctionData('count')
      const callData = account.interface.encodeFunctionData('execute', [counter.address, 0, count])
      // deliberately broken signature.. simulate should work with it too.
      const userOp = await fillAndSign({
        sender: account.address,
        callData
      }, accountOwner1, entryPoint)

      const ret = await entryPoint.callStatic.simulateHandleOp(userOp,
        counter.address,
        counter.interface.encodeFunctionData('counters', [account.address])
      ).catch(e => e.errorArgs)

      const [countResult] = counter.interface.decodeFunctionResult('counters', ret.targetResult)
      expect(countResult).to.eql(1)
      expect(ret.targetSuccess).to.be.true

      // actual counter is zero
      expect(await counter.counters(account.address)).to.eql(0)
    })
  })

  describe('flickering account validation', () => {
    it('should prevent leakage of basefee', async () => {
      const maliciousAccount = await new MaliciousAccount__factory(ethersSigner).deploy(entryPoint.address,
        { value: parseEther('1') })

      const snap = await ethers.provider.send('evm_snapshot', [])
      await ethers.provider.send('evm_mine', [])
      const block = await ethers.provider.getBlock('latest')
      await ethers.provider.send('evm_revert', [snap])

      if (block.baseFeePerGas == null) {
        expect.fail(null, null, 'test error: no basefee')
      }

      const userOp: UserOperation = {
        sender: maliciousAccount.address,
        nonce: await entryPoint.getNonce(maliciousAccount.address, 0),
        signature: defaultAbiCoder.encode(['uint256'], [block.baseFeePerGas]),
        initCode: '0x',
        callData: '0x',
        callGasLimit: '0x' + 1e5.toString(16),
        verificationGasLimit: '0x' + 1e5.toString(16),
        preVerificationGas: '0x' + 1e5.toString(16),
        // we need maxFeeperGas > block.basefee + maxPriorityFeePerGas so requiredPrefund onchain is basefee + maxPriorityFeePerGas
        maxFeePerGas: block.baseFeePerGas.mul(3),
        maxPriorityFeePerGas: block.baseFeePerGas,
        paymasterAndData: '0x'
      }
      try {
        await expect(entryPoint.simulateValidation(userOp, { gasLimit: 1e6 }))
          .to.revertedWith('ValidationResult')
        console.log('after first simulation')
        await ethers.provider.send('evm_mine', [])
        await expect(entryPoint.simulateValidation(userOp, { gasLimit: 1e6 }))
          .to.revertedWith('Revert after first validation')
        // if we get here, it means the userOp passed first sim and reverted second
        expect.fail(null, null, 'should fail on first simulation')
      } catch (e: any) {
        expect(e.message).to.include('Revert after first validation')
      }
    })

    it('should limit revert reason length before emitting it', async () => {
      const revertLength = 1e5
      const REVERT_REASON_MAX_LEN = 2048
      const testRevertAccount = await new TestRevertAccount__factory(ethersSigner).deploy(entryPoint.address, { value: parseEther('1') })
      const badData = await testRevertAccount.populateTransaction.revertLong(revertLength + 1)
      const badOp: UserOperation = {
        ...DefaultsForUserOp,
        sender: testRevertAccount.address,
        callGasLimit: 1e5,
        maxFeePerGas: 1,
        nonce: await entryPoint.getNonce(testRevertAccount.address, 0),
        verificationGasLimit: 1e5,
        callData: badData.data!
      }
      const beneficiaryAddress = createAddress()
      await expect(entryPoint.simulateValidation(badOp, { gasLimit: 3e5 }))
        .to.revertedWith('ValidationResult')
      const tx = await entryPoint.handleOps([badOp], beneficiaryAddress) // { gasLimit: 3e5 })
      const receipt = await tx.wait()
      const userOperationRevertReasonEvent = receipt.events?.find(event => event.event === 'UserOperationRevertReason')
      expect(userOperationRevertReasonEvent?.event).to.equal('UserOperationRevertReason')
      const revertReason = Buffer.from(arrayify(userOperationRevertReasonEvent?.args?.revertReason))
      expect(revertReason.length).to.equal(REVERT_REASON_MAX_LEN)
    })
    describe('warm/cold storage detection in simulation vs execution', () => {
      const TOUCH_GET_AGGREGATOR = 1
      const TOUCH_PAYMASTER = 2
      it('should prevent detection through getAggregator()', async () => {
        const testWarmColdAccount = await new TestWarmColdAccount__factory(ethersSigner).deploy(entryPoint.address,
          { value: parseEther('1') })
        const badOp: UserOperation = {
          ...DefaultsForUserOp,
          nonce: TOUCH_GET_AGGREGATOR,
          sender: testWarmColdAccount.address
        }
        const beneficiaryAddress = createAddress()
        try {
          await entryPoint.simulateValidation(badOp, { gasLimit: 1e6 })
        } catch (e: any) {
          if ((e as Error).message.includes('ValidationResult')) {
            const tx = await entryPoint.handleOps([badOp], beneficiaryAddress, { gasLimit: 1e6 })
            await tx.wait()
          } else {
            expect(e.message).to.include('FailedOp(0, "AA23 reverted (or OOG)")')
          }
        }
      })

    })
  })

  describe('2d nonces', () => {
    const beneficiaryAddress = createAddress()
    let sender: string
    const key = 1
    const keyShifted = BigNumber.from(key).shl(64)

    before(async () => {
      const { proxy } = await createAccount(ethersSigner, accountOwner.address, entryPoint.address)
      sender = proxy.address
      await fund(sender)
    })

    it('should fail nonce with new key and seq!=0', async () => {
      const op = await fillAndSign({
        sender,
        nonce: keyShifted.add(1)
      }, accountOwner, entryPoint)
      await expect(entryPoint.callStatic.handleOps([op], beneficiaryAddress)).to.revertedWith('AA25 invalid account nonce')
    })

    describe('with key=1, seq=1', () => {
      before(async () => {
        const op = await fillAndSign({
          sender,
          nonce: keyShifted
        }, accountOwner, entryPoint)
        await entryPoint.handleOps([op], beneficiaryAddress)
      })

      it('should get next nonce value by getNonce', async () => {
        expect(await entryPoint.getNonce(sender, key)).to.eql(keyShifted.add(1))
      })

      it('should allow to increment nonce of different key', async () => {
        const op = await fillAndSign({
          sender,
          nonce: await entryPoint.getNonce(sender, key)
        }, accountOwner, entryPoint)
        await entryPoint.callStatic.handleOps([op], beneficiaryAddress)
      })

      it('should allow manual nonce increment', async () => {
        // must be called from account itself
        const incNonceKey = 5
        const incrementCallData = entryPoint.interface.encodeFunctionData('incrementNonce', [incNonceKey])
        const callData = account.interface.encodeFunctionData('execute', [entryPoint.address, 0, incrementCallData])
        const op = await fillAndSign({
          sender,
          callData,
          nonce: await entryPoint.getNonce(sender, key)
        }, accountOwner, entryPoint)
        await entryPoint.handleOps([op], beneficiaryAddress)

        expect(await entryPoint.getNonce(sender, incNonceKey)).to.equal(BigNumber.from(incNonceKey).shl(64).add(1))
      })
      it('should fail with nonsequential seq', async () => {
        const op = await fillAndSign({
          sender,
          nonce: keyShifted.add(3)
        }, accountOwner, entryPoint)
        await expect(entryPoint.callStatic.handleOps([op], beneficiaryAddress)).to.revertedWith('AA25 invalid account nonce')
      })
    })
  })

  describe('without paymaster (account pays in eth)', () => {
    describe('#handleOps', () => {
      let counter: TestCounter
      let accountExecFromEntryPoint: PopulatedTransaction
      before(async () => {
        counter = await new TestCounter__factory(ethersSigner).deploy()
        const count = await counter.populateTransaction.count()
        accountExecFromEntryPoint = await account.populateTransaction.execute(counter.address, 0, count.data!)
      })

      it('should revert on signature failure', async () => {
        // wallet-reported signature failure should revert in handleOps
        const wrongOwner = createAccountOwner()
        const op = await fillAndSign({
          sender: account.address
        }, wrongOwner, entryPoint)
        const beneficiaryAddress = createAddress()
        await expect(entryPoint.estimateGas.handleOps([op], beneficiaryAddress)).to.revertedWith('AA24 signature error')
      })

      it('account should pay for tx', async function () {
        const op = await fillAndSign({
          sender: account.address,
          callData: accountExecFromEntryPoint.data,
          verificationGasLimit: 1e6,
          callGasLimit: 1e6
        }, accountOwner, entryPoint)
        const beneficiaryAddress = createAddress()
        const countBefore = await counter.counters(account.address)
        // for estimateGas, must specify maxFeePerGas, otherwise our gas check fails
        console.log('  == est gas=', await entryPoint.estimateGas.handleOps([op], beneficiaryAddress, { maxFeePerGas: 1e9 }).then(tostr))

        // must specify at least on of maxFeePerGas, gasLimit
        // (gasLimit, to prevent estimateGas to fail on missing maxFeePerGas, see above..)
        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 1e7
        }).then(async t => await t.wait())

        const countAfter = await counter.counters(account.address)
        expect(countAfter.toNumber()).to.equal(countBefore.toNumber() + 1)
        console.log('rcpt.gasUsed=', rcpt.gasUsed.toString(), rcpt.transactionHash)

        await calcGasUsage(rcpt, entryPoint, beneficiaryAddress)
      })

      it('account should pay for high gas usage tx', async function () {
        if (process.env.COVERAGE != null) {
          return
        }
        const iterations = 45
        const count = await counter.populateTransaction.gasWaster(iterations, '')
        const accountExec = await account.populateTransaction.execute(counter.address, 0, count.data!)
        const op = await fillAndSign({
          sender: account.address,
          callData: accountExec.data,
          verificationGasLimit: 1e5,
          callGasLimit: 11e5
        }, accountOwner, entryPoint)
        const beneficiaryAddress = createAddress()
        const offsetBefore = await counter.offset()
        console.log('  == offset before', offsetBefore)
        // for estimateGas, must specify maxFeePerGas, otherwise our gas check fails
        console.log('  == est gas=', await entryPoint.estimateGas.handleOps([op], beneficiaryAddress, { maxFeePerGas: 1e9 }).then(tostr))

        // must specify at least on of maxFeePerGas, gasLimit
        // (gasLimit, to prevent estimateGas to fail on missing maxFeePerGas, see above..)
        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 13e5
        }).then(async t => await t.wait())

        console.log('rcpt.gasUsed=', rcpt.gasUsed.toString(), rcpt.transactionHash)
        await calcGasUsage(rcpt, entryPoint, beneficiaryAddress)

        // check that the state of the counter contract is updated
        // this ensures that the `callGasLimit` is high enough
        // therefore this value can be used as a reference in the test below
        console.log('  == offset after', await counter.offset())
        expect(await counter.offset()).to.equal(offsetBefore.add(iterations))
      })

      it('account should not pay if too low gas limit was set', async function () {
        const iterations = 45
        const count = await counter.populateTransaction.gasWaster(iterations, '')
        const accountExec = await account.populateTransaction.execute(counter.address, 0, count.data!)
        const op = await fillAndSign({
          sender: account.address,
          callData: accountExec.data,
          verificationGasLimit: 1e5,
          callGasLimit: 11e5
        }, accountOwner, entryPoint)
        const inititalAccountBalance = await getBalance(account.address)
        const beneficiaryAddress = createAddress()
        const offsetBefore = await counter.offset()
        console.log('  == offset before', offsetBefore)
        // for estimateGas, must specify maxFeePerGas, otherwise our gas check fails
        console.log('  == est gas=', await entryPoint.estimateGas.handleOps([op], beneficiaryAddress, { maxFeePerGas: 1e9 }).then(tostr))

        // must specify at least on of maxFeePerGas, gasLimit
        // (gasLimit, to prevent estimateGas to fail on missing maxFeePerGas, see above..)
        // this transaction should revert as the gasLimit is too low to satisfy the expected `callGasLimit` (see test above)
        await expect(entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 12e5
        })).to.revertedWith('AA95 out of gas')

        // Make sure that the user did not pay for the transaction
        expect(await getBalance(account.address)).to.eq(inititalAccountBalance)
      })

      it('legacy mode (maxPriorityFee==maxFeePerGas) should not use "basefee" opcode', async function () {
        const op = await fillAndSign({
          sender: account.address,
          callData: accountExecFromEntryPoint.data,
          maxPriorityFeePerGas: 10e9,
          maxFeePerGas: 10e9,
          verificationGasLimit: 1e6,
          callGasLimit: 1e6
        }, accountOwner, entryPoint)
        const beneficiaryAddress = createAddress()

        // (gasLimit, to prevent estimateGas to fail on missing maxFeePerGas, see above..)
        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 1e7
        }).then(async t => await t.wait())

        const ops = await debugTransaction(rcpt.transactionHash).then(tx => tx.structLogs.map(op => op.op))
        expect(ops).to.include('GAS')
        expect(ops).to.not.include('BASEFEE')
      })

      it('if account has a deposit, it should use it to pay', async function () {
        await account.addDeposit({ value: ONE_ETH })
        const op = await fillAndSign({
          sender: account.address,
          callData: accountExecFromEntryPoint.data,
          verificationGasLimit: 1e6,
          callGasLimit: 1e6
        }, accountOwner, entryPoint)
        const beneficiaryAddress = createAddress()

        const countBefore = await counter.counters(account.address)
        // for estimateGas, must specify maxFeePerGas, otherwise our gas check fails
        console.log('  == est gas=', await entryPoint.estimateGas.handleOps([op], beneficiaryAddress, { maxFeePerGas: 1e9 }).then(tostr))

        const balBefore = await getBalance(account.address)
        const depositBefore = await entryPoint.balanceOf(account.address)
        // must specify at least one of maxFeePerGas, gasLimit
        // (gasLimit, to prevent estimateGas to fail on missing maxFeePerGas, see above..)
        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 1e7
        }).then(async t => await t.wait())

        const countAfter = await counter.counters(account.address)
        expect(countAfter.toNumber()).to.equal(countBefore.toNumber() + 1)
        console.log('rcpt.gasUsed=', rcpt.gasUsed.toString(), rcpt.transactionHash)

        const balAfter = await getBalance(account.address)
        const depositAfter = await entryPoint.balanceOf(account.address)
        expect(balAfter).to.equal(balBefore, 'should pay from stake, not balance')
        const depositUsed = depositBefore.sub(depositAfter)
        expect(await ethers.provider.getBalance(beneficiaryAddress)).to.equal(depositUsed)

        await calcGasUsage(rcpt, entryPoint, beneficiaryAddress)
      })

      it('should pay for reverted tx', async () => {
        const op = await fillAndSign({
          sender: account.address,
          callData: '0xdeadface',
          verificationGasLimit: 1e6,
          callGasLimit: 1e6
        }, accountOwner, entryPoint)
        const beneficiaryAddress = createAddress()

        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 1e7
        }).then(async t => await t.wait())

        const [log] = await entryPoint.queryFilter(entryPoint.filters.UserOperationEvent(), rcpt.blockHash)
        expect(log.args.success).to.eq(false)
        expect(await getBalance(beneficiaryAddress)).to.be.gte(1)
      })

      it('#handleOp (single)', async () => {
        const beneficiaryAddress = createAddress()

        const op = await fillAndSign({
          sender: account.address,
          callData: accountExecFromEntryPoint.data
        }, accountOwner, entryPoint)

        const countBefore = await counter.counters(account.address)
        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          gasLimit: 1e7
        }).then(async t => await t.wait())
        const countAfter = await counter.counters(account.address)
        expect(countAfter.toNumber()).to.equal(countBefore.toNumber() + 1)

        console.log('rcpt.gasUsed=', rcpt.gasUsed.toString(), rcpt.transactionHash)
        await calcGasUsage(rcpt, entryPoint, beneficiaryAddress)
      })

      it('should fail to call recursively into handleOps', async () => {
        const beneficiaryAddress = createAddress()

        const callHandleOps = entryPoint.interface.encodeFunctionData('handleOps', [[], beneficiaryAddress])
        const execHandlePost = account.interface.encodeFunctionData('execute', [entryPoint.address, 0, callHandleOps])
        const op = await fillAndSign({
          sender: account.address,
          callData: execHandlePost
        }, accountOwner, entryPoint)

        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          gasLimit: 1e7
        }).then(async r => r.wait())

        const error = rcpt.events?.find(ev => ev.event === 'UserOperationRevertReason')
        expect(decodeRevertReason(error?.args?.revertReason)).to.eql('Error(ReentrancyGuard: reentrant call)', 'execution of handleOps inside a UserOp should revert')
      })
      it('should report failure on insufficient verificationGas after creation', async () => {
        const op0 = await fillAndSign({
          sender: account.address,
          verificationGasLimit: 5e5
        }, accountOwner, entryPoint)
        // must succeed with enough verification gas
        await expect(entryPoint.callStatic.simulateValidation(op0))
          .to.revertedWith('ValidationResult')

        const op1 = await fillAndSign({
          sender: account.address,
          verificationGasLimit: 10000
        }, accountOwner, entryPoint)
        await expect(entryPoint.callStatic.simulateValidation(op1))
          .to.revertedWith('AA23 reverted (or OOG)')
      })
    })

    describe('create account', () => {
      if (process.env.COVERAGE != null) {
        return
      }
      let createOp: UserOperation
      const beneficiaryAddress = createAddress() // 1

      it('should reject create if sender address is wrong', async () => {
        const op = await fillAndSign({
          initCode: getAccountInitCode(accountOwner.address, smartContractWalletFactory),
          verificationGasLimit: 2e6,
          sender: '0x'.padEnd(42, '1')
        }, accountOwner, entryPoint)

        await expect(entryPoint.callStatic.handleOps([op], beneficiaryAddress, {
          gasLimit: 1e7
        })).to.revertedWith('AA14 initCode must return sender')
      })

      it('should reject create if account not funded', async () => {
        const op = await fillAndSign({
          initCode: getAccountInitCode(accountOwner.address, smartContractWalletFactory, 100),
          verificationGasLimit: 2e6
        }, accountOwner, entryPoint)

        expect(await ethers.provider.getBalance(op.sender)).to.eq(0)

        await expect(entryPoint.callStatic.handleOps([op], beneficiaryAddress, {
          gasLimit: 1e7,
          gasPrice: await ethers.provider.getGasPrice()
        })).to.revertedWith('didn\'t pay prefund')

        // await expect(await ethers.provider.getCode(op.sender).then(x => x.length)).to.equal(2, "account exists before creation")
      })

      it('should succeed to create account after prefund', async () => {
        const salt = 20
        const preAddr = await getAccountAddress(accountOwner.address, smartContractWalletFactory, salt)
        await fund(preAddr)
        createOp = await fillAndSign({
          initCode: getAccountInitCode(accountOwner.address, smartContractWalletFactory, salt),
          callGasLimit: 1e6,
          verificationGasLimit: 2e6

        }, accountOwner, entryPoint)

        await expect(await ethers.provider.getCode(preAddr).then(x => x.length)).to.equal(2, 'account exists before creation')
        const ret = await entryPoint.handleOps([createOp], beneficiaryAddress, {
          gasLimit: 1e7
        })
        const rcpt = await ret.wait()
        const hash = await entryPoint.getUserOpHash(createOp)
        await expect(ret).to.emit(entryPoint, 'AccountDeployed')
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          .withArgs(hash, createOp.sender, toChecksumAddress(createOp.initCode.toString().slice(0, 42)), AddressZero)

        await calcGasUsage(rcpt!, entryPoint, beneficiaryAddress)
      })

      it('should reject if account already created', async function () {
        const preAddr = await getAccountAddress(accountOwner.address, smartContractWalletFactory)
        if (await ethers.provider.getCode(preAddr).then(x => x.length) === 2) {
          this.skip()
        }

        await expect(entryPoint.callStatic.handleOps([createOp], beneficiaryAddress, {
          gasLimit: 1e7
        })).to.revertedWith('sender already constructed')
      })
    })

    describe('batch multiple requests', function () {
      this.timeout(20000)
      if (process.env.COVERAGE != null) {
        return
      }
      /**
       * attempt a batch:
       * 1. create account1 + "initialize" (by calling counter.count())
       * 2. account2.exec(counter.count()
       *    (account created in advance)
       */
      let counter: TestCounter
      let accountExecCounterFromEntryPoint: PopulatedTransaction
      const beneficiaryAddress = createAddress()
      const accountOwner1 = createAccountOwner()
      let account1: string
      const accountOwner2 = createAccountOwner()
      let account2: SmartContractWallet

      before('before', async () => {
        counter = await new TestCounter__factory(ethersSigner).deploy()
        const count = await counter.populateTransaction.count()
        accountExecCounterFromEntryPoint = await account.populateTransaction.execute(counter.address, 0, count.data!)
        account1 = await getAccountAddress(accountOwner1.address, smartContractWalletFactory);
        ({ proxy: account2 } = await createAccount(ethersSigner, await accountOwner2.getAddress(), entryPoint.address))
        await fund(account1)
        await fund(account2.address)
        // execute and increment counter
        const op1 = await fillAndSign({
          initCode: getAccountInitCode(accountOwner1.address, smartContractWalletFactory),
          callData: accountExecCounterFromEntryPoint.data,
          callGasLimit: 2e6,
          verificationGasLimit: 2e6
        }, accountOwner1, entryPoint)

        const op2 = await fillAndSign({
          callData: accountExecCounterFromEntryPoint.data,
          sender: account2.address,
          callGasLimit: 2e6,
          verificationGasLimit: 76000
        }, accountOwner2, entryPoint)

        await entryPoint.callStatic.simulateValidation(op2, { gasPrice: 1e9 }).catch(simulationResultCatch)

        await fund(op1.sender)
        await fund(account2.address)
        await entryPoint.handleOps([op1!, op2], beneficiaryAddress).catch((rethrow())).then(async r => r!.wait())
        // console.log(ret.events!.map(e=>({ev:e.event, ...objdump(e.args!)})))
      })
      it('should execute', async () => {
        expect(await counter.counters(account1)).equal(1)
        expect(await counter.counters(account2.address)).equal(1)
      })
      it('should pay for tx', async () => {
        // const cost1 = prebalance1.sub(await ethers.provider.getBalance(account1))
        // const cost2 = prebalance2.sub(await ethers.provider.getBalance(account2.address))
        // console.log('cost1=', cost1)
        // console.log('cost2=', cost2)
      })
    })

    describe('Validation time-range', () => {
      const beneficiary = createAddress()
      let account: TestExpiryAccount
      let now: number
      let sessionOwner: Wallet
      before('init account with session key', async () => {
        // create a test account. The primary owner is the global ethersSigner, so that we can easily add a temporaryOwner, below
        account = await new TestExpiryAccount__factory(ethersSigner).deploy(entryPoint.address)
        await account.initialize(await ethersSigner.getAddress())
        await ethersSigner.sendTransaction({ to: account.address, value: parseEther('0.1') })
        now = await ethers.provider.getBlock('latest').then(block => block.timestamp)
        sessionOwner = createAccountOwner()
        await account.addTemporaryOwner(sessionOwner.address, 100, now + 60)
      })

      describe('validateUserOp time-range', function () {
        it('should accept non-expired owner', async () => {
          const userOp = await fillAndSign({
            sender: account.address
          }, sessionOwner, entryPoint)
          const ret = await entryPoint.callStatic.simulateValidation(userOp).catch(simulationResultCatch)
          expect(ret.returnInfo.validUntil).to.eql(now + 60)
          expect(ret.returnInfo.validAfter).to.eql(100)
        })

        it('should not reject expired owner', async () => {
          const expiredOwner = createAccountOwner()
          await account.addTemporaryOwner(expiredOwner.address, 123, now - 60)
          const userOp = await fillAndSign({
            sender: account.address
          }, expiredOwner, entryPoint)
          const ret = await entryPoint.callStatic.simulateValidation(userOp).catch(simulationResultCatch)
          expect(ret.returnInfo.validUntil).eql(now - 60)
          expect(ret.returnInfo.validAfter).to.eql(123)
        })
      })
    
      describe('handleOps should abort on time-range', () => {
        it('should revert on expired account', async () => {
          const expiredOwner = createAccountOwner()
          await account.addTemporaryOwner(expiredOwner.address, 1, 2)
          const userOp = await fillAndSign({
            sender: account.address
          }, expiredOwner, entryPoint)
          await expect(entryPoint.handleOps([userOp], beneficiary))
            .to.revertedWith('AA22 expired or not due')
        })

        it('should revert on date owner', async () => {
          const futureOwner = createAccountOwner()
          await account.addTemporaryOwner(futureOwner.address, now + 100, now + 200)
          const userOp = await fillAndSign({
            sender: account.address
          }, futureOwner, entryPoint)
          await expect(entryPoint.handleOps([userOp], beneficiary))
            .to.revertedWith('AA22 expired or not due')
        })
      })
    })
  })
})
