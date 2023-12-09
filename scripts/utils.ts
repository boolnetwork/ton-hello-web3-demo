import 'dotenv/config';

export function loadEnv() {
    return {
        ENDPOINT: process.env.ENDPOINT || 'https://testnet.toncenter.com/api/v2/jsonRPC',
        WALLET_MNEMONIC: process.env.WALLET_MNEMONIC,
        TON_COMMITTEE_PUBLIC_KEY: process.env.TON_COMMITTEE_PUBLIC_KEY,
        TON_ANCHOR_ADDRESS: process.env.TON_ANCHOR_ADDRESS,
        EVM_CHAIN_ID: process.env.EVM_CHAIN_ID,
        EVM_ANCHOR_ADDRESS: process.env.EVM_ANCHOR_ADDRESS,
        MESSENGER_ADDRESS: process.env.MESSENGER_ADDRESS || 'EQCsEJfDuKKEkWT7Gjf0rGjF8XkM3Ugb4zF7SIOlXbdJnVJk',
    };
}
