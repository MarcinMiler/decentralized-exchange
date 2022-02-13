import { BigNumber } from '@ethersproject/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

import DexPair from '../artifacts/contracts/DexPair.sol/DexPair.json'
import { setupFullRouterTest, setupTokens } from './fixtures'
import { expandTo18Decimals } from './utils/expandTo18Decimals'
import { getCreate2Address } from './utils/getCreate2Address'

describe('DexRouter', async () => {
  let factory: SignerWithAddress
  let wallet: SignerWithAddress

  const MINIMUM_LIQUIDITY = 10 ** 3

  before(async () => {
    ;[factory, wallet] = await ethers.getSigners()
  })

  it('should set as owner dexFactory contract', async () => {
    const { dexFactory, dexRouter } = await setupFullRouterTest(factory, wallet)

    const owner = await dexRouter.factory()

    expect(owner).to.eq(dexFactory.address)
  })

  it('should create pair on adding liquidity if pair does not exist', async () => {
    const { tokenA, tokenB } = await setupTokens()

    const DexFactory = await ethers.getContractFactory('DexFactory')
    const dexFactory = await DexFactory.deploy()
    await dexFactory.deployed()

    const DexRouter = await ethers.getContractFactory('DexRouter')
    const dexRouter = await DexRouter.deploy(dexFactory.address)
    await dexRouter.deployed()

    const amountToken0 = expandTo18Decimals(1)
    const amountToken1 = expandTo18Decimals(1)

    await tokenA.mint(amountToken0)
    await tokenB.mint(amountToken1)

    await tokenA.approve(dexRouter.address, amountToken0)
    await tokenB.approve(dexRouter.address, amountToken1)

    const expectedPairAddress = getCreate2Address(
      dexFactory.address,
      [tokenA.address, tokenB.address],
      DexPair.bytecode
    )

    await expect(
      dexRouter.addLiquidity(
        tokenA.address,
        tokenB.address,
        amountToken0,
        amountToken1,
        factory.address
      )
    )
      .to.emit(dexFactory, 'PairCreated')
      .withArgs(tokenA.address, tokenB.address, expectedPairAddress)

    const pairAddress = await dexFactory.getPair(tokenA.address, tokenB.address)

    expect(pairAddress).to.equal(expectedPairAddress)
  })

  it(`should add initial liquidity`, async () => {
    const { token0, token1, dexPair, dexRouter } = await setupFullRouterTest(
      factory,
      wallet
    )
    const amountToken0 = expandTo18Decimals(1)
    const amountToken1 = expandTo18Decimals(4)

    await token0.mint(amountToken0)
    await token1.mint(amountToken1)

    await token0.approve(dexRouter.address, amountToken0)
    await token1.approve(dexRouter.address, amountToken1)

    const expectedLPTokens = expandTo18Decimals(2).sub(MINIMUM_LIQUIDITY)

    await expect(
      dexRouter.addLiquidity(
        token0.address,
        token1.address,
        amountToken0,
        amountToken1,
        factory.address
      )
    )
      .to.emit(token0, 'Transfer')
      .withArgs(factory.address, dexPair.address, amountToken0)

      .to.emit(token1, 'Transfer')
      .withArgs(factory.address, dexPair.address, amountToken1)

      .to.emit(dexPair, 'Transfer')
      .withArgs(
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        MINIMUM_LIQUIDITY
      )

      .to.emit(dexPair, 'Transfer')
      .withArgs(ethers.constants.AddressZero, factory.address, expectedLPTokens)

      .to.emit(dexPair, 'Sync')
      .withArgs(amountToken0, amountToken1)

      .to.emit(dexPair, 'Mint')
      .withArgs(dexRouter.address, amountToken0, amountToken1)

    const lpTokensBalance = await dexPair.balanceOf(factory.address)
    expect(lpTokensBalance).to.equal(expectedLPTokens)
  })

  it('should add liquidity with correct asset ratio when initial liquidity is set', async () => {
    const { token0, token1, dexPair, dexRouter } = await setupFullRouterTest(
      factory,
      wallet
    )

    const firstToken0Liquidity = expandTo18Decimals(1)
    const firstToken1Liquidity = expandTo18Decimals(4)

    const secondToken0Liquidity = expandTo18Decimals(1)
    const secondToken1Liquidity = expandTo18Decimals(20)

    const sendedToken1Liquidity = firstToken1Liquidity
    const expectedLPTokens = expandTo18Decimals(2)

    const tokens1Left = secondToken1Liquidity.sub(firstToken1Liquidity)

    await token0.mint(firstToken0Liquidity.add(secondToken0Liquidity))
    await token1.mint(firstToken1Liquidity.add(secondToken1Liquidity))

    await token0.approve(dexRouter.address, ethers.constants.MaxInt256)
    await token1.approve(dexRouter.address, ethers.constants.MaxInt256)

    await dexRouter.addLiquidity(
      token0.address,
      token1.address,
      firstToken0Liquidity,
      firstToken1Liquidity,
      factory.address
    )

    await token0.approve(dexRouter.address, ethers.constants.MaxInt256)
    await token1.approve(dexRouter.address, ethers.constants.MaxInt256)

    expect(
      await dexRouter.addLiquidity(
        token0.address,
        token1.address,
        secondToken0Liquidity,
        secondToken1Liquidity,
        factory.address
      )
    )
      .to.emit(token0, 'Transfer')
      .withArgs(factory.address, dexPair.address, secondToken0Liquidity)

      .to.emit(token1, 'Transfer')
      .withArgs(factory.address, dexPair.address, sendedToken1Liquidity)

      .to.emit(dexPair, 'Transfer')
      .withArgs(ethers.constants.AddressZero, factory.address, expectedLPTokens)

      .to.emit(dexPair, 'Sync')
      .withArgs(
        firstToken0Liquidity.add(secondToken0Liquidity),
        firstToken1Liquidity.add(sendedToken1Liquidity)
      )

      .to.emit(dexPair, 'Mint')
      .withArgs(dexRouter.address, secondToken0Liquidity, sendedToken1Liquidity)

    const token0Balance = await token0.balanceOf(factory.address)
    const token1Balance = await token1.balanceOf(factory.address)

    expect([token0Balance, token1Balance]).to.deep.eq([
      BigNumber.from(0),
      tokens1Left,
    ])
  })

  it(`should revert when user provide less than ${MINIMUM_LIQUIDITY} on adding initial liquidity`, async () => {
    const { token0, token1, dexRouter } = await setupFullRouterTest(
      factory,
      wallet
    )
    const amountToken0 = 1000
    const amountToken1 = 1000

    await token0.mint(BigNumber.from(amountToken0))
    await token1.mint(BigNumber.from(amountToken1))

    await token0.approve(dexRouter.address, amountToken0)
    await token1.approve(dexRouter.address, amountToken1)

    await expect(
      dexRouter.addLiquidity(
        token0.address,
        token1.address,
        amountToken0,
        amountToken1,
        factory.address
      )
    ).to.be.revertedWith('INSUFFICIENT_LIQUIDITY_MINTED')
  })

  it('should remove liquidity and receive deposited tokens', async () => {
    const { token0, token1, dexPair, dexRouter } = await setupFullRouterTest(
      factory,
      wallet
    )

    const amountToken0 = expandTo18Decimals(1)
    const amountToken1 = expandTo18Decimals(4)

    await token0.mint(amountToken0)
    await token1.mint(amountToken1)

    await token0.approve(dexRouter.address, amountToken0)
    await token1.approve(dexRouter.address, amountToken1)

    const expectedToken0Return = amountToken0.sub(500)
    const expectedToken1Return = amountToken1.sub(2000)

    await dexRouter.addLiquidity(
      token0.address,
      token1.address,
      amountToken0,
      amountToken1,
      factory.address
    )

    await dexPair.approve(dexRouter.address, expandTo18Decimals(2))

    const expectedLiq = expandTo18Decimals(2).sub(MINIMUM_LIQUIDITY)

    await expect(
      dexRouter.removeLiquidity(token0.address, token1.address, expectedLiq)
    )
      .to.emit(dexPair, 'Transfer')
      .withArgs(factory.address, dexPair.address, expectedLiq)

      .to.emit(dexPair, 'Transfer')
      .withArgs(dexPair.address, ethers.constants.AddressZero, expectedLiq)

      .to.emit(token0, 'Transfer')
      .withArgs(dexPair.address, factory.address, expectedToken0Return)

      .to.emit(token1, 'Transfer')
      .withArgs(dexPair.address, factory.address, expectedToken1Return)

      .to.emit(dexPair, 'Sync')
      .withArgs(500, 2000)

      .to.emit(dexPair, 'Burn')
      .withArgs(
        dexRouter.address,
        expectedToken0Return,
        expectedToken1Return,
        factory.address
      )
  })

  it('should swap exact tokens for tokens', async () => {
    const { token0, token1, dexPair, dexRouter } = await setupFullRouterTest(
      factory,
      wallet
    )

    const amountToken0 = expandTo18Decimals(1000000)
    const amountToken1 = expandTo18Decimals(1000000)

    await token0.mint(amountToken0)
    await token1.mint(amountToken1)

    await token0.approve(dexRouter.address, amountToken0)
    await token1.approve(dexRouter.address, amountToken1)

    const expectedAmountOut = BigNumber.from('996005988017964053892')
    const amountIn = expandTo18Decimals(1000)
    const amountInMin = expandTo18Decimals(900)

    const token0Liq = amountToken0.sub(expandTo18Decimals(1000))
    const token1Liq = amountToken1.sub(expandTo18Decimals(1000))

    const expectedToken0Liq = token0Liq.add(amountIn)
    const expectedToken1Liq = token1Liq.sub(expectedAmountOut)

    await dexRouter.addLiquidity(
      token0.address,
      token1.address,
      token0Liq,
      token1Liq,
      factory.address
    )

    await expect(
      dexRouter.swapExactTokensForTokens(
        amountIn,
        amountInMin,
        token0.address,
        token1.address,
        factory.address
      )
    )
      .to.emit(token0, 'Transfer')
      .withArgs(factory.address, dexPair.address, amountIn)

      .to.emit(token1, 'Transfer')
      .withArgs(dexPair.address, factory.address, expectedAmountOut)

      .to.emit(dexPair, 'Sync')
      .withArgs(expectedToken0Liq, expectedToken1Liq)

    const reserve0 = await dexPair.reserve0()
    const reserve1 = await dexPair.reserve1()

    expect(reserve0).to.eq(expectedToken0Liq)
    expect(reserve1).to.eq(expectedToken1Liq)

    const pairToken0Balance = await token0.balanceOf(dexPair.address)
    const pairToken1Balance = await token1.balanceOf(dexPair.address)

    expect(pairToken0Balance).to.eq(BigNumber.from(expectedToken0Liq))
    expect(pairToken1Balance).to.eq(BigNumber.from(expectedToken1Liq))
  })

  it('should swap tokens for exact tokens', async () => {
    const { token0, token1, dexPair, dexRouter } = await setupFullRouterTest(
      factory,
      wallet
    )

    const amountToken0 = expandTo18Decimals(1000000)
    const amountToken1 = expandTo18Decimals(1000000)

    await token0.mint(amountToken0)
    await token1.mint(amountToken1)

    await token0.approve(dexRouter.address, amountToken0)
    await token1.approve(dexRouter.address, amountToken1)

    const expectedAmountIn = BigNumber.from('999993981969957873428')
    const amountOut = expandTo18Decimals(996)
    const amountOutMin = expandTo18Decimals(1100)

    const token0Liq = amountToken0.sub(expandTo18Decimals(1000))
    const token1Liq = amountToken1.sub(expandTo18Decimals(1000))

    const expectedToken0Liq = token0Liq.add(expectedAmountIn)
    const expectedToken1Liq = token1Liq.sub(amountOut)

    await dexRouter.addLiquidity(
      token0.address,
      token1.address,
      token0Liq,
      token1Liq,
      factory.address
    )

    expect(
      dexRouter.swapTokensForExactTokens(
        amountOut,
        amountOutMin,
        token0.address,
        token1.address,
        factory.address
      )
    )
      .to.emit(token0, 'Transfer')
      .withArgs(factory.address, dexPair.address, expectedAmountIn)

      .to.emit(token1, 'Transfer')
      .withArgs(dexPair.address, factory.address, amountOut)

      .to.emit(dexPair, 'Sync')
      .withArgs(expectedToken0Liq, expectedToken1Liq)

    const reserve0 = await dexPair.reserve0()
    const reserve1 = await dexPair.reserve1()

    expect(reserve0).to.eq(expectedToken0Liq)
    expect(reserve1).to.eq(expectedToken1Liq)

    const pairToken0Balance = await token0.balanceOf(dexPair.address)
    const pairToken1Balance = await token1.balanceOf(dexPair.address)

    expect(pairToken0Balance).to.eq(BigNumber.from(expectedToken0Liq))
    expect(pairToken1Balance).to.eq(BigNumber.from(expectedToken1Liq))
  })

  it('should quote', async () => {
    const { dexRouter } = await setupFullRouterTest(factory, wallet)

    expect(
      await dexRouter.quote(
        expandTo18Decimals(1),
        expandTo18Decimals(10),
        expandTo18Decimals(20)
      )
    ).to.deep.equal(expandTo18Decimals(2))
  })

  it('should getAmountOut', async () => {
    const { dexRouter } = await setupFullRouterTest(factory, wallet)

    expect(
      await dexRouter.getAmountOut(
        expandTo18Decimals(1),
        expandTo18Decimals(999999999),
        expandTo18Decimals(999999999)
      )
    ).to.deep.eq('996999999005990999') // 0.996
  })

  it('should getAmountIn', async () => {
    const { dexRouter } = await setupFullRouterTest(factory, wallet)

    expect(
      await dexRouter.getAmountIn(
        expandTo18Decimals(1),
        expandTo18Decimals(999999999),
        expandTo18Decimals(999999999)
      )
    ).to.deep.eq('1003009028084252761') // 1.003
  })
})
