import { TypeormDatabase, Store } from '@subsquid/typeorm-store';
import { In, Int32 } from 'typeorm';
import * as ss58 from '@subsquid/ss58';
import assert from 'assert';

import { processor, ProcessorContext } from './processor';
import { Account, Transfer, Asset, AssetTransfer } from './model'; // Import models
import { events } from './types';
import { ALL } from 'dns';

import { ApiPromise, WsProvider } from '@polkadot/api';
import { assertNotNull, DataHandlerContext } from '@subsquid/substrate-processor';
import { boolean } from './model/generated/marshal';

async function initializeApi() {
    const wsProvider = new WsProvider(assertNotNull(process.env.RPC_ENDPOINT, 'No RPC endpoint supplied')); // Replace with your chain's WebSocket endpoint
    const api = await ApiPromise.create({ provider: wsProvider });
    return api;
}

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
    const api = await initializeApi(); // Step 1: Initialize API
    let transferEvents: TransferEvent[] = getTransferEvents(ctx);
    let assetTransferEvents: AssetTransferEvent[] = await getAssetTransferEvents(ctx);

    let accounts: Map<string, Account> = await createAccounts(ctx, transferEvents, assetTransferEvents);
    let assets: Map<string, Asset> = await createAssets(ctx, assetTransferEvents, api);
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
    fee?: bigint; // Added fee
}

function getTransferEvents(ctx: ProcessorContext<Store>): TransferEvent[] {
    let transfers: TransferEvent[] = [];
    const ss58Codec = ss58.codec(42); // Replace 42 with your chain's SS58 prefix.

    for (let block of ctx.blocks) {
        for (let event of block.events) {
            if (event.name == events.balances.transfer.name) {
                let rec: { from: string; to: string; amount: bigint; fee?: bigint };

                // Handle different versions of the transfer event
                if (events.balances.transfer.v1.is(event)) {
                    // If `decode` returns an object, destructure its properties
                    const decoded = events.balances.transfer.v1.decode(event);
                    rec = { from: decoded.from, to: decoded.to, amount: decoded.amount, fee: event.extrinsic?.fee };
                } else {
                    throw new Error('Unsupported transfer event version');
                }

                // Ensure that the timestamp is available
                assert(block.header.timestamp, `Got an undefined timestamp at block ${block.header.height}`);
                transfers.push({
                    id: event.id,
                    blockNumber: block.header.height,
                    timestamp: new Date(block.header.timestamp),
                    extrinsicHash: event.extrinsic?.hash,
                    from: ss58Codec.encode(rec.from),
                    to: ss58Codec.encode(rec.to),
                    amount: rec.amount,
                    fee: rec.fee || 0n,
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
                let rec: { assetId: string; from?: string; to?: string; amount: bigint; fee?: bigint };

                // Handle different versions of the assets transfer event
                if (events.assets.transferred.v1.is(event)) {
                    let decoded = events.assets.transferred.v1.decode(event);
                    rec = {
                        assetId: decoded.assetId.toString(),
                        from: decoded.from ? decoded.from.toString() : undefined,
                        to: decoded.to ? decoded.to.toString() : undefined,
                        amount: decoded.amount,
                        fee: event.extrinsic?.fee, // Added fee
                    };
                } else {
                    throw new Error('Unsupported asset transfer event version');
                }

                assert(block.header.timestamp, `Got an undefined timestamp at block ${block.header.height}`);

                assetTransfers.push({
                    id: event.id,
                    blockNumber: block.header.height,
                    timestamp: new Date(block.header.timestamp),
                    extrinsicHash: event.extrinsic?.hash,
                    from: rec.from ? ss58Codec.encode(rec.from) : undefined,
                    to: rec.to ? ss58Codec.encode(rec.to) : undefined,
                    assetId: rec.assetId,
                    amount: rec.amount,
                    fee: rec.fee || 0n, // Added fee
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

    const accounts = await ctx.store.findBy(Account, { id: In([...accountIds]) }).then((accounts) => {
        return new Map(accounts.map((a) => [a.id, a]));
    });

    for (let id of accountIds) {
        if (!accounts.has(id)) {
            accounts.set(id, new Account({ id }));
        }
    }

    return accounts;
}

async function createAssets(ctx: ProcessorContext<Store>, assetTransferEvents: AssetTransferEvent[], api: ApiPromise): Promise<Map<string, Asset>> {
    const assetIds = new Set<string>();
    for (let t of assetTransferEvents) {
        assetIds.add(t.assetId);
    }

    // Fetch existing assets from the store
    const assets = await ctx.store.findBy(Asset, { id: In([...assetIds]) }).then((assets) => {

        return new Map(assets.map((a) => [a.id, a]));
    });

    // Initialize assets that do not exist in the store
    for (let id of assetIds) {
        if (!assets.has(id)) {
            // If asset is new, initialize with zero total supply and an optional name field.
            const metadata = await api.query.assets.metadata(id);
            if (metadata) {
                 // Extract name and symbol
                const metadataHuman = metadata.toHuman();

                const name = (metadataHuman && typeof metadataHuman === 'object' && 'name' in metadataHuman) 
                    ? metadataHuman.name  : `Asset-${id}`;  // Fallback if name is not available

                const symbol = (metadataHuman && typeof metadataHuman === 'object' && 'symbol' in metadataHuman) 
                    ? metadataHuman.symbol  : `SYM-${id}`;  // Optional fallback for symbol

                const isFrozen = (metadataHuman && typeof metadataHuman === 'object' && 'isFrozen' in metadataHuman) 
                    ? metadataHuman.isFrozen  : `SYM-${id}`;  // Optional fallback for isFrozen
                
                const decimals = (metadataHuman && typeof metadataHuman === 'object' && 'decimals' in metadataHuman) 
                    ? metadataHuman.decimals  : `SYM-${id}`;  // Optional fallback for decimals

                console.log(`Metadata for asset ${id}:`, metadata.toHuman());
                assets.set(id, new Asset({ id, totalSupply: 0n, name: name?.toString(), symbol: symbol?.toString(), isFrozen: Boolean(isFrozen), decimals: Number(decimals)}));
            } else {
                assets.set(id, new Asset({ id, totalSupply: 0n, name: `Asset-${id}` })); // Fallback name
            }
            // assets.set(id, new Asset({ id, totalSupply: 0n, name: `Asset-${id}` }));
        }
    }

    // Update the total supply for each asset based on the asset transfer events
    for (let event of assetTransferEvents) {
        let asset = assets.get(event.assetId);
        if (asset) {
            // Adjust total supply based on transfer amounts (this logic depends on your use case)
            asset.totalSupply += event.amount;
        }
    }

    return assets;
}

function createTransfers(transferEvents: TransferEvent[], accounts: Map<string, Account>): Transfer[] {
    let transfers: Transfer[] = [];
    for (let t of transferEvents) {
        let { id, blockNumber, timestamp, extrinsicHash, amount, fee } = t;
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
        let { id, blockNumber, timestamp, extrinsicHash, amount, assetId, fee } = t;
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
            fee,
            asset,
        }));
    }
    return assetTransfers;
}
