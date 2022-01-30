import { BigNumber } from '@ethersproject/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

import { DexPair, Token } from '../typechain'

describe('DexPair', async () => {
  let factory: SignerWithAddress
  let signer2: SignerWithAddress
  let dexPair: DexPair
  let WETH: Token
  let DAI: Token

  const deployToken = async (name: string, symbol: string) => {
    const Token = await ethers.getContractFactory('Token')

    const token = await Token.deploy(name, symbol)

    await token.deployed()

    return token
  }

  beforeEach(async () => {
    ;[factory, signer2] = await ethers.getSigners()

    const DexPair = await ethers.getContractFactory('DexPair')
    dexPair = await DexPair.deploy()
    await dexPair.deployed()

    WETH = await deployToken('Wrapped Ether', 'WETH')
    DAI = await deployToken('Dai', 'DAI')
  })

  it('should set correct owner', async () => {
    const owner = await dexPair.factory()

    expect(owner).to.eq(factory)
  })

  it('should initialize pair', async () => {
    await dexPair.initialize(DAI.address, WETH.address)

    const token0 = await dexPair.token0()
    const token1 = await dexPair.token1()

    const reserve0 = await dexPair.reserve0()
    const reserve1 = await dexPair.reserve1()

    expect([token0, token1]).to.deep.equal([DAI.address, WETH.address])
    expect([reserve0, reserve1]).to.deep.equal([
      BigNumber.from(0),
      BigNumber.from(0),
    ])
  })

  it('should revert when not factory owner call initialize pair', async () => {
    await expect(
      dexPair.connect(signer2).initialize(DAI.address, WETH.address)
    ).to.be.revertedWith('FORBIDDEN')
  })
})
