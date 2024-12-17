import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, IntColumn as IntColumn_, BooleanColumn as BooleanColumn_, BigIntColumn as BigIntColumn_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
import {AssetTransfer} from "./assetTransfer.model"

@Entity_()
export class Asset {
    constructor(props?: Partial<Asset>) {
        Object.assign(this, props)
    }

    /**
     * Unique identifier for the asset
     */
    @PrimaryColumn_()
    id!: string

    /**
     * Name or symbol of the asset
     */
    @StringColumn_({nullable: true})
    name!: string | undefined | null

    @StringColumn_({nullable: true})
    symbol!: string | undefined | null

    @IntColumn_({nullable: true})
    decimals!: number | undefined | null

    @BooleanColumn_({nullable: true})
    isFrozen!: boolean | undefined | null

    /**
     * Total supply of the asset
     */
    @BigIntColumn_({nullable: false})
    totalSupply!: bigint

    /**
     * List of transfers for this asset
     */
    @OneToMany_(() => AssetTransfer, e => e.asset)
    transfers!: AssetTransfer[]
}
