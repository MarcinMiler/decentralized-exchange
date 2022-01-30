import { BigNumber } from '@ethersproject/bignumber'

export const expandTo18Decimals = (n: number) =>
  BigNumber.from(n).mul(BigNumber.from(10).pow(18))
