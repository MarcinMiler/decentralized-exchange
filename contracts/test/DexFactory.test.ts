import { expect } from 'chai'
import { ethers } from 'hardhat'

import { DexFactory, Token } from '../typechain'
import DexPair from '../artifacts/contracts/DexPair.sol/DexPair.json'
import { getCreate2Address } from './utils/getCreate2Address'

const deployToken = async (name: string, symbol: string) => {
  const Token = await ethers.getContractFactory('Token')

  const token = await Token.deploy(name, symbol)

  await token.deployed()

  return token
}

describe('DexFactory', function () {
  let dexFactory: DexFactory
  let WETH: Token
  let DAI: Token

  beforeEach(async () => {
    const DexFactory = await ethers.getContractFactory('DexFactory')
    dexFactory = await DexFactory.deploy()
    await dexFactory.deployed()

    WETH = await deployToken('Wrapped Ether', 'WETH')
    DAI = await deployToken('Dai', 'DAI')
  })

  it('should create a new pair', async () => {
    const create2Address = getCreate2Address(
      dexFactory.address,
      [WETH.address, DAI.address],
      DexPair.bytecode
    )

    await expect(dexFactory.createPair(WETH.address, DAI.address))
      .to.emit(dexFactory, 'PairCreated')
      .withArgs(DAI.address, WETH.address, create2Address)

    const pair = await dexFactory.getPair(WETH.address, DAI.address)

    expect(pair).to.equal(create2Address)
  })

  it('should revert when on providing two the same tokens', async () => {
    await expect(
      dexFactory.createPair(WETH.address, WETH.address)
    ).to.be.revertedWith('IDENTICAL ADDRESS')
  })

  it('should revert when one of token has 0 address', async () => {
    await expect(
      dexFactory.createPair(
        '0x0000000000000000000000000000000000000000',
        WETH.address
      )
    ).to.be.revertedWith('ZERO ADDRESS')
  })

  it('should revert when pair already exists', async () => {
    dexFactory.createPair(WETH.address, DAI.address)

    expect(dexFactory.createPair(WETH.address, DAI.address)).to.be.revertedWith(
      'PAIR EXISTS'
    )
  })
})
