import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4, Dictionary, toNano, beginCell, Address } from '@ton/ton';
import { HelloWeb3 } from '../wrappers/HelloWeb3';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { loadEnv } from './utils';

async function deploy() {
    // use .env params
    let envs = loadEnv();
    console.log(envs);
    const TON_COMMITTEE_PUBLIC_KEY = envs.TON_COMMITTEE_PUBLIC_KEY ?? '';
    const TON_ANCHOR_ADDRESS =
        envs.TON_ANCHOR_ADDRESS ?? '0x5edd3f25658e251e403ed18b90c417434138555e3545e0a6b9e4244f4cb0960c';
    const EVM_CHAIN_ID = Number(envs.EVM_CHAIN_ID ?? 421613);
    const MESSENGER_ADDRESS = envs.MESSENGER_ADDRESS;

    // initialize ton rpc client on testnet
    const endpoint = envs.ENDPOINT;
    const client = new TonClient({ endpoint });

    const cmtPk = BigInt(TON_COMMITTEE_PUBLIC_KEY);
    console.log('cmtPk', cmtPk);
    // open wallet v4 (notice the correct wallet version here)
    const mnemonic = envs.WALLET_MNEMONIC ?? '';
    const key = await mnemonicToPrivateKey(mnemonic.split(' '));
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    console.log('wallet address', wallet.address);
    if (!(await client.isContractDeployed(wallet.address))) {
        return console.log('wallet is not deployed');
    }
    const walletContract = client.open(wallet);
    const walletSender = walletContract.sender(key.secretKey);
    const messengerAddress = Address.parse(MESSENGER_ADDRESS);
    const anchor = TON_ANCHOR_ADDRESS;

    const helloWeb3Code = await compile('HelloWeb3');
    const helloWeb3 = HelloWeb3.createForDeploy(helloWeb3Code, {
        messenger: messengerAddress,
        anchor: BigInt(anchor),
        counter: BigInt(0),
        map: Dictionary.empty(),
    });
    const helloWeb3Contract = client.open(helloWeb3);

    //// send hello world
    let buf = Buffer.from('hello world');
    let messageData = beginCell().storeBuffer(buf).endCell();

    let dst_chain_id = EVM_CHAIN_ID;
    const seqno = await walletContract.getSeqno();
    await helloWeb3Contract.sendGreeting(walletSender, {
        value: toNano('0.1'),
        dstChainId: dst_chain_id,
        message: messageData,
    });
    await waiting_for_confirm(seqno);

    async function waiting_for_confirm(seqno: number) {
        let currentSeqno = seqno;
        while (currentSeqno == seqno) {
            console.log('waiting for transaction to confirm...');
            await sleep(1500);
            currentSeqno = await walletContract.getSeqno();
        }
    }
}

deploy();

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
