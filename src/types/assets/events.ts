import {sts, Block, Bytes, Option, Result, EventType, RuntimeCtx} from '../support'
import * as v1 from '../v1'

export const transferred =  {
    name: 'Assets.Transferred',
    /**
     * Some assets were transferred.
     */
    v1: new EventType(
        'Assets.Transferred',
        sts.struct({
            assetId: sts.number(),
            from: v1.AccountId32,
            to: v1.AccountId32,
            amount: sts.bigint(),
        })
    ),
}
