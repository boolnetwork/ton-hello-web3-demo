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
} from '@ton/core';

export type HelloWeb3Config = {
    messenger: Address;
    anchor: bigint;
    counter: bigint;
    map: Dictionary<bigint, Cell>;
};

export function helloWeb3ConfigToCell(config: HelloWeb3Config): Cell {
    return beginCell()
        .storeAddress(config.messenger)
        .storeUint(config.anchor, 256)
        .storeUint(config.counter, 32)
        .storeDict(config.map)
        .endCell();
}

export const Opcodes = {
    send_greeting: 0x92ec8394,
};

export class HelloWeb3 implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createForDeploy(code: Cell, config: HelloWeb3Config): HelloWeb3 {
        const data = helloWeb3ConfigToCell(config);
        const workchain = 0; // deploy to workchain 0
        const address = contractAddress(workchain, { code, data });
        return new HelloWeb3(address, { code, data });
    }

    static createFromAddress(address: Address) {
        return new HelloWeb3(address);
    }

    static createFromConfig(config: HelloWeb3Config, code: Cell, workchain = 0) {
        const data = helloWeb3ConfigToCell(config);
        const init = { code, data };
        return new HelloWeb3(contractAddress(workchain, init), init);
    }

    static constructGreetingBody(opts: { value: bigint; dstChainId: number; message: Cell; queryID?: number }): Cell {
        return beginCell()
            .storeUint(Opcodes.send_greeting, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeUint(opts.dstChainId, 32)
            .storeRef(opts.message)
            .endCell();
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendGreeting(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            dstChainId: number;
            message: Cell;
            queryID?: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: HelloWeb3.constructGreetingBody(opts),
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

    async getMap(provider: ContractProvider, index: number) {
        const result = await provider.get('get_map', [{ type: 'int', value: BigInt(index) }]);
        console.log(result);
        return result.stack.readCell();
    }
}
