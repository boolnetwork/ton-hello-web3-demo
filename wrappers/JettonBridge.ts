import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export function buildUpdateBindingParams(jettonMaster: Address, isLockedJetton: number, queryID?: number): Cell {
    return beginCell()
        .storeUint(Opcodes.updateBinding, 32)
        .storeUint(queryID ?? 0, 64)
        .storeAddress(jettonMaster)
        .storeUint(isLockedJetton, 1)
        .endCell();
}

export type JettonBridgeConfig = {
    messenger: Address;
    anchor: bigint;
    admin: Address;
    jettonMaster: Address;
    isLockedJetton: number;
    jettonWalletCode: Cell;
};

export function JettonBridgeConfigToCell(config: JettonBridgeConfig): Cell {
    let binding = beginCell().storeAddress(config.jettonMaster).storeUint(config.isLockedJetton, 1).endCell();
    return beginCell()
        .storeAddress(config.messenger)
        .storeUint(config.anchor, 256)
        .storeAddress(config.admin)
        .storeRef(binding)
        .storeRef(config.jettonWalletCode)
        .endCell();
}

export const Opcodes = {
    bridgeOut: 0xaf2173b9,
    updateBinding: 0x79441915,
};

export class JettonBridge implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createForDeploy(code: Cell, config: JettonBridgeConfig): JettonBridge {
        const data = JettonBridgeConfigToCell(config);
        const workchain = 0; // deploy to workchain 0
        const address = contractAddress(workchain, { code, data });
        return new JettonBridge(address, { code, data });
    }

    static createFromAddress(address: Address) {
        return new JettonBridge(address);
    }

    static createFromConfig(config: JettonBridgeConfig, code: Cell, workchain = 0) {
        const data = JettonBridgeConfigToCell(config);
        const init = { code, data };
        return new JettonBridge(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendUpdateBinding(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            jettonMaster: Address;
            isLockedJetton: number;
            queryID?: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildUpdateBindingParams(opts.jettonMaster, opts.isLockedJetton, opts.queryID),
        });
    }

    async getMessenger(provider: ContractProvider) {
        const result = await provider.get('get_messenger', []);
        return result.stack.readAddress();
    }

    async getAnchor(provider: ContractProvider) {
        const result = await provider.get('get_anchor', []);
        return result.stack.readBigNumber();
    }

    async getAdmin(provider: ContractProvider) {
        const result = await provider.get('get_admin', []);
        return result.stack.readAddress();
    }

    async getJettonWallet(provider: ContractProvider) {
        const result = await provider.get('get_jetton_wallet', []);
        return result.stack.readAddress();
    }

    async getJettonMaster(provider: ContractProvider) {
        const result = await provider.get('get_jetton_master', []);
        return result.stack.readAddress();
    }

    async getIsLockedJetton(provider: ContractProvider) {
        const result = await provider.get('get_is_locked_jetton', []);
        return result.stack.readAddress();
    }
}
