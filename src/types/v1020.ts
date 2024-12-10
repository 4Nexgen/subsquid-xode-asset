import {sts, Result, Option, Bytes, BitSequence} from './support'

export const Balance = sts.bigint()

export const AccountId = sts.bytes()

export const AssetId = sts.bytes()
