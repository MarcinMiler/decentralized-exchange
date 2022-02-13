import { Contract } from '@ethersproject/contracts'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { MockProvider } from 'ethereum-waffle'
import { ethers } from 'hardhat'

import DexPair from '../../artifacts/contracts/DexPair.sol/DexPair.json'

import { DexPair as DexPairType, Token } from '../../typechain'

export const getSortedTokens = async (
  dexPair: DexPairType,
  tokenA: Token,
  tokenB: Token
) => {
  const token0Address = await dexPair.token0()

  return token0Address === tokenA.address
    ? { token0: tokenA, token1: tokenB }
    : { token0: tokenB, token1: tokenA }
}

export const setupTokens = async () => {
  const Token = await ethers.getContractFactory('Token')

  const tokenA = await Token.deploy('Token A', 'TKA')
  const tokenB = await Token.deploy('Token B', 'TKB')

  await tokenA.deployed()
  await tokenB.deployed()

  return {
    tokenA,
    tokenB,
  }
}

export const setupFullRouterTest = async (
  factory: SignerWithAddress,
  wallet: SignerWithAddress
) => {
  const { tokenA, tokenB } = await setupTokens()

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
    new MockProvider()
  ).connect(factory) as DexPairType

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
