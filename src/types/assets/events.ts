import { sts, EventType } from '../support';
import * as v1020 from '../v1020';
import * as v1050 from '../v1050';
import * as v9130 from '../v9130';


export const transferred = {
    name: 'Assets.Transfer',
    /**
     * Asset transfer succeeded (assetId, from, to, amount).
     */
    v1020: new EventType(
        'Assets.Transfer',
        sts.tuple([v1020.AssetId, v1020.AccountId, v1020.AccountId, v1020.Balance])
    ),
    /**
     * Asset transfer succeeded (assetId, from, to, amount, fee).
     */
    v1050: new EventType(
        'Assets.Transfer',
        sts.tuple([v1050.AssetId, v1050.AccountId, v1050.AccountId, v1050.Balance, v1050.Balance])
    ),
    /**
     * Asset transfer succeeded (assetId, from, to, amount).
     */
    v9130: new EventType(
        'Assets.Transfer',
        sts.struct({
            assetId: sts.bigint(), // Assuming assetId is a bigint for v9130
            from: v9130.AccountId32,
            to: v9130.AccountId32,
            amount: sts.bigint(),
        })
    ),
};
