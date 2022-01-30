import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { MockProvider } from 'ethereum-waffle'
import { ethers } from 'hardhat'

import DexPair from '../artifacts/contracts/DexPair.sol/DexPair.json'
import {
  DexFactory,
  DexPair as DexPairType,
  DexRouter,
  Token,
} from '../typechain'
import { expandTo18Decimals } from './utils/expandTo18Decimals'
import { getCreate2Address } from './utils/getCreate2Address'

const setup = async (provider: MockProvider, wallet: SignerWithAddress) => {
  const Token = await ethers.getContractFactory('Token')

  const tokenA = await Token.deploy('Token A', 'TKA')
  const tokenB = await Token.deploy('Token B', 'TKB')

  await tokenA.deployed()
  await tokenB.deployed()

  const DexFactory = await ethers.getContractFactory('DexFactory')
  const dexFactory = await DexFactory.deploy()
  await dexFactory.deployed()

  const DexRouter = await ethers.getContractFactory('DexRouter')
  const dexRouter = await DexRouter.deploy(dexFactory.address)
  await dexRouter.deployed()

  const txn = await dexFactory.createPair(tokenA.address, tokenB.address)
  await txn.wait()
  const pairAddress = await dexFactory.getPair(tokenA.address, tokenB.address)

  const dexPair = new Contract(
    pairAddress,
    JSON.stringify(DexPair.abi),
    provider
  ).connect(wallet) as DexPairType

  await dexPair.reserve0()

  const { token0, token1 } = await getSortedTokens(dexPair, tokenA, tokenB)

  return {
    tokenA,
    tokenB,
    token0,
    token1,
    pairAddress,
    dexFactory,
    dexRouter,
    dexPair,
  }
}

const getSortedTokens = async (
  dexPair: DexPairType,
  tokenA: Token,
  tokenB: Token
) => {
  const token0Address = await dexPair.token0()

  return token0Address === tokenA.address
    ? { token0: tokenA, token1: tokenB }
    : { token0: tokenB, token1: tokenA }
}

describe('DexPair', async () => {
  const provider = new MockProvider()

  let factory: SignerWithAddress
  let signer2: SignerWithAddress

  let tokenA: Token
  let tokenB: Token
  let token0: Token
  let token1: Token
  let pairAddress: string
  let dexFactory: DexFactory
  let dexRouter: DexRouter
  let dexPair: DexPairType

  const MINIMUM_LIQUIDITY = 10 ** 3

  beforeEach(async () => {
    ;[factory, signer2] = await ethers.getSigners()

    const fixutre = await setup(provider, factory)
    tokenA = fixutre.tokenA
    tokenB = fixutre.tokenB
    token0 = fixutre.token0
    token1 = fixutre.token1
    pairAddress = fixutre.pairAddress
    dexFactory = fixutre.dexFactory
    dexRouter = fixutre.dexRouter
    dexPair = fixutre.dexPair
  })

  // it('should set as owner dexFactory contract', async () => {
  //   const owner = await dexRouter.factory()

  //   expect(owner).to.eq(dexFactory.address)
  // })

  // it('should create pair on adding liquidity if pair does not exist', async () => {
  //   await WETH.mint(BigNumber.from(100))
  //   await DAI.mint(BigNumber.from(100))

  //   await WETH.approve(dexRouter.address, 100)
  //   await DAI.approve(dexRouter.address, 100)

  //   const expectedPairAddress = getCreate2Address(
  //     dexFactory.address,
  //     [DAI.address, WETH.address],
  //     DexPair.bytecode
  //   )

  //   await expect(
  //     dexRouter.addLiquidity(DAI.address, WETH.address, 1, 1, factory.address)
  //   )
  //     .to.emit(dexFactory, 'PairCreated')
  //     .withArgs(WETH.address, DAI.address, expectedPairAddress)

  //   const pairAddress = await dexFactory.getPair(DAI.address, WETH.address)

  //   expect(pairAddress).to.equal(expectedPairAddress)
  // })

  it.only(`should
  * burn first ${MINIMUM_LIQUIDITY} liquidity tokens
  * mint rest amount
  `, async () => {
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

  // it(`should revert when user provide less than ${MINIMUM_LIQUIDITY} on adding first liquidity`, async () => {
  //   const amountWETH = 1000
  //   const amountDAI = 1000

  //   await WETH.mint(BigNumber.from(amountWETH))
  //   await DAI.mint(BigNumber.from(amountDAI))

  //   await WETH.approve(dexRouter.address, amountWETH)
  //   await DAI.approve(dexRouter.address, amountDAI)

  //   await expect(
  //     dexRouter.addLiquidity(
  //       DAI.address,
  //       WETH.address,
  //       amountDAI,
  //       amountWETH,
  //       factory.address
  //     )
  //   ).to.be.revertedWith('INSUFFICIENT_LIQUIDITY_MINTED')
  // })

  // it.only('should remove liquidity and receive deposited tokens', async () => {
  //   const amountToken0 = expandTo18Decimals(2000)
  //   const amountToken1 = expandTo18Decimals(2000)

  //   await token0.mint(amountToken0)
  //   await token1.mint(amountToken1)

  //   await token0.approve(dexRouter.address, amountToken0)
  //   await token1.approve(dexRouter.address, amountToken1)

  //   const expectedToken0Return = amountToken0.sub(expandTo18Decimals(1000))
  //   const expectedToken1Return = amountToken1.sub(expandTo18Decimals(1000))

  //   const expectedLiq = expandTo18Decimals(1000)

  //   await dexRouter.addLiquidity(
  //     token0.address,
  //     token1.address,
  //     amountToken0,
  //     amountToken1,
  //     factory.address
  //   )

  //   const lpTokens = await dexPair.balanceOf(factory.address)

  //   console.log(lpTokens.toString(), 'lp')

  //   await dexPair.approve(dexRouter.address, expandTo18Decimals(1000))

  //   await expect(
  //     dexRouter.removeLiquidity(
  //       token0.address,
  //       token1.address,
  //       lpTokens,
  //       factory.address
  //     )
  //   )
  //   // .to.emit(token0, 'Transfer')
  //   // .withArgs(dexPair.address, factory.address, expectedToken0Return)

  //   // .to.emit(token1, 'Transfer')
  //   // .withArgs(dexPair.address, factory.address, expectedToken1Return)

  //   const balance0 = await token0.balanceOf(factory.address)
  //   const balance1 = await token0.balanceOf(factory.address)

  //   console.log(balance0.toString(), balance1.toString(), 'al')

  //   // .to.emit(dexPair, 'Sync')
  //   // .withArgs(expectedLiq, expectedLiq)

  //   // .to.emit(dexPair, 'Burn')
  //   // .withArgs(dexRouter.address, expectedLiq, expectedLiq, factory.address)
  // })

  it('should swap exact tokens for tokens', async () => {
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
})
