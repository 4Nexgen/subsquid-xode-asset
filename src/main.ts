import {TypeormDatabase, Store} from '@subsquid/typeorm-store';
import {In} from 'typeorm';
import * as ss58 from '@subsquid/ss58';
import assert from 'assert';

import {processor, ProcessorContext} from './processor';
import {Account, Transfer, Asset, AssetTransfer} from './model'; // Add Asset and AssetTransfer models
import {events} from './types';

processor.run(new TypeormDatabase({supportHotBlocks: true}), async (ctx) => {
    let transferEvents: TransferEvent[] = getTransferEvents(ctx);
    let assetTransferEvents: AssetTransferEvent[] = getAssetTransferEvents(ctx);

    let accounts: Map<string, Account> = await createAccounts(ctx, transferEvents, assetTransferEvents);
    let assets: Map<string, Asset> = await createAssets(ctx, assetTransferEvents);
    let transfers: Transfer[] = createTransfers(transferEvents, accounts);
    let assetTransfers: AssetTransfer[] = createAssetTransfers(assetTransferEvents, accounts, assets);

    await ctx.store.upsert([...accounts.values()]);
    await ctx.store.upsert([...assets.values()]);
    await ctx.store.insert(transfers);
    await ctx.store.insert(assetTransfers);
});

interface TransferEvent {
    id: string;
    blockNumber: number;
    timestamp: Date;
    extrinsicHash?: string;
    from: string;
    to: string;
    amount: bigint;
    fee?: bigint;
}

interface AssetTransferEvent {
    id: string;
    blockNumber: number;
    timestamp: Date;
    extrinsicHash?: string;
    from?: string;
    to?: string;
    assetId: string;
    amount: bigint;
}

function getTransferEvents(ctx: ProcessorContext<Store>): TransferEvent[] {
    let transfers: TransferEvent[] = [];
    const ss58Codec = ss58.codec(42); // Replace 42 with your chain's SS58 prefix.

    for (let block of ctx.blocks) {
        for (let event of block.events) {
            if (event.name == events.balances.transfer.name) {
                let rec: {from: string; to: string; amount: bigint};
                if (events.balances.transfer.v1020.is(event)) {
                    let [from, to, amount] = events.balances.transfer.v1020.decode(event);
                    rec = {from, to, amount};
                } else if (events.balances.transfer.v1050.is(event)) {
                    let [from, to, amount] = events.balances.transfer.v1050.decode(event);
                    rec = {from, to, amount};
                } else if (events.balances.transfer.v9130.is(event)) {
                    rec = events.balances.transfer.v9130.decode(event);
                } else {
                    throw new Error('Unsupported spec');
                }

                assert(block.header.timestamp, `Got an undefined timestamp at block ${block.header.height}`);

                transfers.push({
                    id: event.id,
                    blockNumber: block.header.height,
                    timestamp: new Date(block.header.timestamp),
                    extrinsicHash: event.extrinsic?.hash,
                    from: ss58Codec.encode(rec.from),
                    to: ss58Codec.encode(rec.to),
                    amount: rec.amount,
                    fee: event.extrinsic?.fee || 0n,
                });
            }
        }
    }
    return transfers;
}

function getAssetTransferEvents(ctx: ProcessorContext<Store>): AssetTransferEvent[] {
    let assetTransfers: AssetTransferEvent[] = [];
    const ss58Codec = ss58.codec(42); // Replace 42 with your chain's SS58 prefix.

    for (let block of ctx.blocks) {
        for (let event of block.events) {
            if (event.name == events.assets.transferred.name) {
                let rec: { assetId: string; from?: string; to?: string; amount: bigint };

                // Handle different versions of the assets transfer event
                if (events.assets.transferred.v1020.is(event)) {
                    let [assetId, from, to, amount] = events.assets.transferred.v1020.decode(event);
                    rec = { 
                        assetId: assetId.toString(), // Convert assetId from bigint to string
                        from, 
                        to, 
                        amount 
                    };
                } else if (events.assets.transferred.v1050.is(event)) {
                    let [assetId, from, to, amount] = events.assets.transferred.v1050.decode(event);
                    rec = { 
                        assetId: assetId.toString(), // Convert assetId from bigint to string
                        from, 
                        to, 
                        amount 
                    };
                } else if (events.assets.transferred.v9130.is(event)) {
                    let decoded = events.assets.transferred.v9130.decode(event);
                    rec = { 
                        assetId: decoded.assetId.toString(), // Convert assetId from bigint to string
                        from: decoded.from, 
                        to: decoded.to, 
                        amount: decoded.amount 
                    };
                } else {
                    throw new Error('Unsupported asset transfer event version');
                }

                assert(block.header.timestamp, `Got an undefined timestamp at block ${block.header.height}`);

                // Push the processed asset transfer into the array
                assetTransfers.push({
                    id: event.id,
                    blockNumber: block.header.height,
                    timestamp: new Date(block.header.timestamp),
                    extrinsicHash: event.extrinsic?.hash,
                    from: rec.from ? ss58Codec.encode(rec.from) : undefined,
                    to: rec.to ? ss58Codec.encode(rec.to) : undefined,
                    assetId: rec.assetId,
                    amount: rec.amount,
                });
            }
        }
    }

    return assetTransfers;
}



async function createAccounts(ctx: ProcessorContext<Store>, transferEvents: TransferEvent[], assetTransferEvents: AssetTransferEvent[]): Promise<Map<string, Account>> {
    const accountIds = new Set<string>();
    for (let t of transferEvents) {
        accountIds.add(t.from);
        accountIds.add(t.to);
    }
    for (let t of assetTransferEvents) {
        if (t.from) accountIds.add(t.from);
        if (t.to) accountIds.add(t.to);
    }

    const accounts = await ctx.store.findBy(Account, {id: In([...accountIds])}).then((accounts) => {
        return new Map(accounts.map((a) => [a.id, a]));
    });

    for (let id of accountIds) {
        if (!accounts.has(id)) {
            accounts.set(id, new Account({id}));
        }
    }

    return accounts;
}

async function createAssets(ctx: ProcessorContext<Store>, assetTransferEvents: AssetTransferEvent[]): Promise<Map<string, Asset>> {
    const assetIds = new Set<string>();
    for (let t of assetTransferEvents) {
        assetIds.add(t.assetId);
    }

    const assets = await ctx.store.findBy(Asset, {id: In([...assetIds])}).then((assets) => {
        return new Map(assets.map((a) => [a.id, a]));
    });

    for (let id of assetIds) {
        if (!assets.has(id)) {
            assets.set(id, new Asset({id, totalSupply: 0n})); // Initialize with 0 supply; update later if needed.
        }
    }

    return assets;
}

function createTransfers(transferEvents: TransferEvent[], accounts: Map<string, Account>): Transfer[] {
    let transfers: Transfer[] = [];
    for (let t of transferEvents) {
        let {id, blockNumber, timestamp, extrinsicHash, amount, fee} = t;
        let from = accounts.get(t.from)!;
        let to = accounts.get(t.to)!;
        transfers.push(new Transfer({
            id,
            blockNumber,
            timestamp,
            extrinsicHash,
            from,
            to,
            amount,
            fee,
        }));
    }
    return transfers;
}

function createAssetTransfers(assetTransferEvents: AssetTransferEvent[], accounts: Map<string, Account>, assets: Map<string, Asset>): AssetTransfer[] {
    let assetTransfers: AssetTransfer[] = [];
    for (let t of assetTransferEvents) {
        let {id, blockNumber, timestamp, extrinsicHash, amount, assetId} = t;
        let from = t.from ? accounts.get(t.from) : undefined;
        let to = t.to ? accounts.get(t.to) : undefined;
        let asset = assets.get(assetId)!;

        assetTransfers.push(new AssetTransfer({
            id,
            blockNumber,
            timestamp,
            extrinsicHash,
            from,
            to,
            amount,
            asset,
        }));
    }
    return assetTransfers;
}
