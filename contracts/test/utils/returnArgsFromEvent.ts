import { ContractReceipt } from '@ethersproject/contracts'
import { Result } from '@ethersproject/abi'
import * as F from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as A from 'fp-ts/lib/Array'

import { TypedEvent } from '../../typechain/common'

export const returnArgsFromEvent =
  <T extends TypedEvent<Result>>(eventName: string) =>
  (receipt: ContractReceipt): T['args'] =>
    F.pipe(
      O.fromNullable(receipt.events),
      O.chain(A.findFirst(({ event }) => event === eventName)),
      O.chainNullableK((event) => event.args),
      O.getOrElseW(() => [])
    )
