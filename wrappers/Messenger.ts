import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Dictionary,
    Slice,
    Builder,
} from '@ton/core';

export type MessengerConfig = {
    this_chain_id: number;
    anchors: Dictionary<bigint, boolean>;
    export_nonce: Dictionary<number, bigint>;
    import_uids: Dictionary<number, Dictionary<bigint, boolean>>;
    fee_admin: Address;
    fee_receiver: Address;
    fee_config: Dictionary<number, Slice>;
};

export function messengerConfigToCell(config: MessengerConfig): Cell {
    return beginCell()
        .storeInt(config.this_chain_id, 32)
        .storeDict(config.anchors)
        .storeDict(config.export_nonce)
        .storeDict(config.import_uids)
        .storeAddress(config.fee_admin)
        .storeAddress(config.fee_receiver)
        .storeDict(config.fee_config)
        .endCell();
}

export const Opcodes = {
    enable_global_path: 0x2dad39eb,
    register_anchor: 0x3634b0b4,
    withdraw_fee: 0x27b385ca,
    set_fee_admin: 0x1d84e68b,
    set_fee_receiver: 0x30432c99,
    send_message: 0x2aaed1c,
    receive_message: 0xf1876ad7,
    update_consumer: 0x56a815a5,
    enable_path: 0x5b35eb59,
    set_fee_config: 0x17132b36,
    handle_message_result_from_consumer: 0xf2990f99,
};

export class Messenger implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createForDeploy(code: Cell, config: MessengerConfig): Messenger {
        const data = beginCell()
            .storeUint(config.this_chain_id, 32)
            .storeDict(config.anchors)
            .storeDict(config.export_nonce)
            .storeDict(config.import_uids)
            .storeAddress(config.fee_admin)
            .storeAddress(config.fee_receiver)
            .storeDict(config.fee_config)
            .endCell();
        const workchain = 0; // deploy to workchain 0
        const address = contractAddress(workchain, { code, data });
        return new Messenger(address, { code, data });
    }

    static createFromAddress(address: Address) {
        return new Messenger(address);
    }

    static createFromConfig(config: MessengerConfig, code: Cell, workchain = 0) {
        const data = messengerConfigToCell(config);
        const init = { code, data };
        return new Messenger(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getBalance(provider: ContractProvider) {
        const state = await provider.getState();
        return state.balance;
    }

    async get_contract_balance_change(provider: ContractProvider, balance_before: bigint) {
        const state = await provider.getState();
        const balance_now = state.balance;
        return balance_now - balance_before;
    }

    async sendEnableGlobalPath(
        provider: ContractProvider,
        via: Sender,
        opts: {
            chainId: number;
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.enable_global_path, 32)
                // .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.chainId, 32)
                .endCell(),
        });
    }

    async sendRegisterAnchor(
        provider: ContractProvider,
        via: Sender,
        opts: {
            cmt_pk: bigint;
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.register_anchor, 32).storeUint(opts.cmt_pk, 256).endCell(),
        });
    }

    async sendWithdrawFee(
        provider: ContractProvider,
        via: Sender,
        opts: {
            to: Address;
            amount: bigint;
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdraw_fee, 32)
                .storeAddress(opts.to)
                .storeCoins(opts.amount)
                .endCell(),
        });
    }

    async sendSetFeeAdmin(
        provider: ContractProvider,
        via: Sender,
        opts: {
            new_fee_contract: Address;
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.set_fee_admin, 32).storeAddress(opts.new_fee_contract).endCell(),
        });
    }

    async sendSetFeeReceiver(
        provider: ContractProvider,
        via: Sender,
        opts: {
            new_fee_receiver: Address;
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.set_fee_receiver, 32).storeAddress(opts.new_fee_receiver).endCell(),
        });
    }

    async sendSetFeeConfig(
        provider: ContractProvider,
        via: Sender,
        opts: {
            chain_id: number;
            gas_per_byte: bigint;
            base_gas_amount: bigint;
            gas_price: bigint;
            dst_price: number;
            src_price: number;
            p_num: number;
            p_denum: number;
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.set_fee_config, 32)
                .storeUint(opts.chain_id, 32)
                .storeUint(opts.gas_per_byte, 256)
                .storeUint(opts.base_gas_amount, 256)
                .storeUint(opts.gas_price, 256)
                .storeUint(opts.dst_price, 8)
                .storeUint(opts.src_price, 8)
                .storeUint(opts.p_num, 8)
                .storeUint(opts.p_denum, 8)
                .endCell(),
        });
    }

    async sendMessage(
        provider: ContractProvider,
        via: Sender,
        opts: {
            refund_address: Address;
            cross_type: bigint;
            extra_feed: Slice;
            dst_chain_id: number;
            dst_anchor: bigint;
            payload: Slice;
            anchor: bigint;
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.send_message, 32)
                .storeAddress(opts.refund_address)
                .storeUint(opts.cross_type, 256)
                .storeRef(beginCell().storeSlice(opts.extra_feed))
                .storeUint(opts.dst_chain_id, 32)
                .storeRef(beginCell().storeSlice(opts.payload))
                .storeUint(opts.anchor, 256)
                .endCell(),
        });
    }

    async sendReceiveMessage(
        provider: ContractProvider,
        via: Sender,
        opts: {
            uid: bigint;
            cross_type: Builder;
            src_anchor: bigint;
            extra_feed: Builder;
            dst_anchor: bigint;
            payload: Builder;
            signature: Slice;
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.receive_message, 32)
                .storeUint(opts.uid, 256)
                .storeRef(opts.cross_type)
                .storeUint(opts.src_anchor, 256)
                .storeRef(opts.extra_feed)
                .storeUint(opts.dst_anchor, 256)
                .storeRef(opts.payload)
                .storeRef(beginCell().storeSlice(opts.signature))
                .endCell(),
        });
    }

    async sendUpdateConsumer(
        provider: ContractProvider,
        via: Sender,
        opts: {
            anchor: bigint;
            new_consumer: Address;
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.update_consumer, 32)
                .storeUint(opts.anchor, 256)
                .storeAddress(opts.new_consumer)
                .endCell(),
        });
    }

    async sendEnablePath(
        provider: ContractProvider,
        via: Sender,
        opts: {
            anchor: bigint;
            dst_chain: number;
            dst_anchor: bigint;
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.enable_path, 32)
                .storeUint(opts.anchor, 256)
                .storeUint(opts.dst_chain, 32)
                .storeUint(opts.dst_anchor, 256)
                .endCell(),
        });
    }

    async getPathIsEnabled(provider: ContractProvider, chainId: number) {
        const result = await provider.get('get_path_is_enabled', [{ type: 'int', value: BigInt(chainId) }]);
        // return result.stack.readNumber();
        return result.stack.readBoolean();
    }

    async getAnchorIsInit(provider: ContractProvider, anchor: bigint) {
        const result = await provider.get('get_anchor_is_init', [{ type: 'int', value: anchor }]);
        // return result.stack.readNumber();
        return result.stack.readBoolean();
    }

    async getFeeReceiver(provider: ContractProvider) {
        const result = await provider.get('get_fee_receiver', []);
        return result.stack.readAddress();
    }

    async getFeeAdmin(provider: ContractProvider) {
        const result = await provider.get('get_fee_admin', []);
        return result.stack.readAddress();
    }

    async getNextExportNonce(provider: ContractProvider, chainId: number) {
        const result = await provider.get('get_next_export_nonce', [{ type: 'int', value: BigInt(chainId) }]);
        return result.stack.readNumber();
    }

    async getNonceIsExist(provider: ContractProvider, chainId: number, nonce: number) {
        const result = await provider.get('get_nonce_is_exist', [
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(nonce) },
        ]);
        return result.stack.readBoolean();
    }

    async getCommittee(provider: ContractProvider, anchor: bigint) {
        const result = await provider.get('get_committee', [{ type: 'int', value: anchor }]);
        return result.stack.readBigNumber();
    }

    async getIsDestinationEnabled(provider: ContractProvider, anchor: bigint, chain_id: number) {
        const result = await provider.get('get_is_destination_enabled', [
            { type: 'int', value: anchor },
            { type: 'int', value: BigInt(chain_id) },
        ]);
        return result.stack.readBoolean();
    }

    async getConsumer(provider: ContractProvider, anchor: bigint) {
        const result = await provider.get('get_consumer', [{ type: 'int', value: anchor }]);
        return result.stack.readAddress();
    }

    async getFeeConfig(provider: ContractProvider, chain_id: number) {
        const result = await provider.get('get_fee_config', [{ type: 'int', value: BigInt(chain_id) }]);
        return result.stack.readBigNumber();
    }

    async getCrossFee(provider: ContractProvider, payload: Cell, extra_feed: Cell, dst_chain: number) {
        const result = await provider.get('get_cross_fee', [
            { type: 'cell', cell: payload },
            { type: 'cell', cell: extra_feed },
            { type: 'int', value: BigInt(dst_chain) },
        ]);
        return result.stack.readBigNumber();
    }
}
