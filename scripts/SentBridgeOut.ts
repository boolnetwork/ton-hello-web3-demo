import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4, Dictionary, toNano, beginCell, Address, Cell } from '@ton/ton';
import { HelloWeb3 } from '../wrappers/HelloWeb3';
import '@ton/test-utils';
import { JETTON_WALLET_BOC_CODE, loadEnv } from './utils';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { compile } from '@ton/blueprint';
import { JettonBridge } from '../wrappers/JettonBridge';

async function run() {
    // use .env params
    let envs = loadEnv();
    console.log(envs);
    const TON_COMMITTEE_PUBLIC_KEY = envs.TON_COMMITTEE_PUBLIC_KEY ?? '';
    const TON_ANCHOR_ADDRESS =
        envs.TON_ANCHOR_ADDRESS ?? '0x5edd3f25658e251e403ed18b90c417434138555e3545e0a6b9e4244f4cb0960c';
    const EVM_CHAIN_ID = Number(envs.EVM_CHAIN_ID ?? 421613);
    const JETTON_MINTER_ADDRESS = envs.JETTON_MINTER_ADDRESS ?? '';

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
    const jettonMinterAddress = Address.parse(JETTON_MINTER_ADDRESS);
    const messengerAddress = Address.parse(envs.MESSENGER_ADDRESS);
   
    const jettonMinterContract = client.open(JettonMinter.createFromAddress(jettonMinterAddress));
    if (!await client.isContractDeployed(jettonMinterContract.address)) {
        console.log('jettonMinter not deployed');
        return;
    }
    const senderJettonWalletAddress = await jettonMinterContract.getWalletAddress(wallet.address);
    const senderJettonWalletContract = client.open(JettonWallet.createFromAddress(senderJettonWalletAddress));
    if (!await client.isContractDeployed(senderJettonWalletContract.address)) {
        console.log('senderJettonWallet not deployed');
        return;
    }

    const anchor = TON_ANCHOR_ADDRESS;
    const jettonBridgeCode = await compile('JettonBridge');
    const jettonWalletCode = Cell.fromBoc(Buffer.from(JETTON_WALLET_BOC_CODE, 'hex'))[0];
    const jettonBridge = JettonBridge.createForDeploy(jettonBridgeCode, {
        messenger: messengerAddress,
        anchor: BigInt(anchor),
        admin: wallet.address,
        jettonMaster: jettonMinterContract.address,
        isLockedJetton: 1,
        jettonWalletCode: jettonWalletCode
    });

    const jettonBridgeContract = client.open(jettonBridge);
    console.log('jettonBridge contract address:', jettonBridge.address.toString());
    if (!await client.isContractDeployed(jettonBridgeContract.address)) {
        console.log('jettonBridge not deployed');
        return;
    }

    const jettonBalance = await senderJettonWalletContract.getBalance();
    console.log('sender jetton balance:', jettonBalance.toString());

    //// sent jetton token to eth chain.
    let dst_chain_id = EVM_CHAIN_ID;
    const seqno = await walletContract.getSeqno();
    // TODO: your actual jetton amount and receiver address of eth chain.
    let jettonAmount = toNano('10');
    let dst_anchor = BigInt("0x781ED35B167068c93dFAdAb41dfb680eDaca4E50");
    await senderJettonWalletContract.sendJettonTransferToBridge(walletSender, {
        value: toNano('0.5'),
        jetton_amount: jettonAmount,
        to: jettonBridge.address,
        response_addr: jettonBridge.address,
        forward_ton_amount: toNano('0.1'),
        dst_chain: dst_chain_id,
        recipient: dst_anchor,
        refund_address: wallet.address,
    })
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

run();

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
