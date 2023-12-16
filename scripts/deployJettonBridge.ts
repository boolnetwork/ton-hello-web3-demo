import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4, Dictionary, toNano, beginCell, Address, Cell } from '@ton/ton';
import { Messenger } from '../wrappers/Messenger';
import { JettonBridge } from '../wrappers/JettonBridge';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JETTON_MASTER_BOC_CODE, JETTON_WALLET_BOC_CODE, loadEnv } from './utils';
import { JettonMinter } from '../wrappers/JettonMinter';

async function deploy() {
    // use .env params
    let envs = loadEnv();
    console.log(envs);
    const TON_COMMITTEE_PUBLIC_KEY = envs.TON_COMMITTEE_PUBLIC_KEY ?? '';
    const TON_ANCHOR_ADDRESS =
        envs.TON_ANCHOR_ADDRESS ?? '0x5edd3f25658e251e403ed18b90c417434138555e3545e0a6b9e4244f4cb0960c';
    const EVM_ANCHOR_ADDRESS = envs.EVM_ANCHOR_ADDRESS ?? '0x65fb860d54a5f175a68e09db5881f756e04ca657';
    const EVM_CHAIN_ID = Number(envs.EVM_CHAIN_ID ?? 421613);
    const MESSENGER_ADDRESS = envs.MESSENGER_ADDRESS;
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

    const messengerAddress = Address.parse(MESSENGER_ADDRESS);
    const messengerContract = client.open(Messenger.createFromAddress(messengerAddress));

    const jettonWalletCode = Cell.fromBoc(Buffer.from(JETTON_WALLET_BOC_CODE, 'hex'))[0];
    const jettonMinterCode = Cell.fromBoc(Buffer.from(JETTON_MASTER_BOC_CODE, 'hex'))[0];

    //// step0: deploy or load token minter and mint jetton
    let jettonMinter: JettonMinter;
    if (JETTON_MINTER_ADDRESS.length != 0 ) {
        jettonMinter = JettonMinter.createFromAddress(Address.parse(JETTON_MINTER_ADDRESS));
    } else {
        // Note: Jetton deployed in this way will not be parsed by the browser[https://testnet.tonscan.org]. 
        // It is recommended to deploy it on https://minter.ton.org/?testnet=true
        jettonMinter = JettonMinter.createFromConfig(
            {
                owner: wallet.address,
                name: "Jetton USDT",
                symbol: "JUSDT",
                image: "https://www.linkpicture.com/q/download_183.png",
                description: "My jetton",
                // TODO: build metadata
                context: beginCell().endCell(),
                walletCode: jettonWalletCode,
            },
            jettonMinterCode
        )
    }
    
    const jettonMinterContract = client.open(jettonMinter);
    console.log('jettonMinter contract address:', jettonMinter.address.toString());
    if (await client.isContractDeployed(jettonMinter.address)) {
        console.log('jettonMinter already deployed');
    } else {
        console.log('deploy jettonMinter contract......');
        const seqno = await walletContract.getSeqno();
        // send the deploy transaction
        await jettonMinterContract.sendDeploy(walletSender, toNano('0.1'));

        // wait until confirmed
        await waiting_for_confirm(seqno);
        console.log('deploy jettonBridge confirmed!');
    }

    const jettonWalletAddress = await jettonMinterContract.getWalletAddress(wallet.address);
    console.log(`my jetton wallet address: ${jettonWalletAddress}`);

    let info = await jettonMinterContract.getJettonData();
    console.log(`jetton minter data: \n totalSupply: ${info.totalSupply}\n adminAddress: ${info.adminAddress}`);
    if (info.adminAddress.equals(wallet.address) && info.totalSupply == BigInt(0)) {
        // mint jetton 
        console.log('mint jetton......');
        const seqno = await walletContract.getSeqno();
        // send the mint transaction
        await jettonMinterContract.sendMint(walletSender, {
            value: toNano("0.1"),
            to: wallet.address,
            amount: toNano("10000"),
        })
        // wait until confirmed
        await waiting_for_confirm(seqno);
        console.log('mint jetton confirmed!');
    }

    //// step1: deploy token bridge and transfer the owner of jetton-minter to bridge
    const anchor = TON_ANCHOR_ADDRESS;
    const jettonBridgeCode = await compile('JettonBridge');
    const jettonBridge = JettonBridge.createForDeploy(jettonBridgeCode, {
        messenger: messengerAddress,
        anchor: BigInt(anchor),
        admin: wallet.address,
        jettonMaster: jettonMinter.address,
        isLockedJetton: 1,
        jettonWalletCode: jettonWalletCode
    });

    const jettonBridgeContract = client.open(jettonBridge);
    console.log('jettonBridge contract address:', jettonBridge.address.toString());
    if (await client.isContractDeployed(jettonBridge.address)) {
        console.log('jettonBridge already deployed');
    } else {
        console.log('deploy jettonBridge contract......');
        const seqno = await walletContract.getSeqno();
        await jettonBridgeContract.sendDeploy(walletSender, toNano('0.1'));

        await waiting_for_confirm(seqno);
        console.log('deploy jettonBridge confirmed!');
    }


    if (info.adminAddress.equals(jettonBridge.address)) {
        console.log('the owner of Minter is jettonBridge');
    } else {
        console.log('transfer minter owner to jettonBridge contract......');
        const seqno = await walletContract.getSeqno();
        await jettonMinterContract.sendTransferOwner(walletSender, {
            value: toNano('0.1'), 
            newOwner: jettonBridge.address
        });
        await waiting_for_confirm(seqno);
        console.log('deploy jettonBridge confirmed!');
    }

    //// step2: update consumer
    let src_anchor = BigInt(anchor);
    const consumer_before = await messengerContract.getConsumer(src_anchor);
    if (consumer_before.toString() == jettonBridgeContract.address.toString()) {
        console.log(`anchor ${src_anchor} consumer address was updated`);
    } else {
        console.log('call to messenger to update consumer addr about anchor');
        const seqno = await walletContract.getSeqno();

        await messengerContract.sendUpdateConsumer(walletSender, {
            anchor: src_anchor,
            new_consumer: jettonBridgeContract.address,
            value: toNano('0.05'),
        });

        await waiting_for_confirm(seqno);
        console.log('update consumer addr about anchor confirmed!');
    }

    //// step3: enable path
    let dst_chain_id = EVM_CHAIN_ID;
    let dst_anchor = BigInt(EVM_ANCHOR_ADDRESS);
    const is_path_enabled = await messengerContract.getIsDestinationEnabled(src_anchor, dst_chain_id);
    if (is_path_enabled) {
        console.log(`path ${dst_chain_id} for anchor ${jettonBridgeContract.address} was enabled`);
    } else {
        console.log('call to send enable path for anchor...');
        const seqno = await walletContract.getSeqno();
        await messengerContract.sendEnablePath(walletSender, {
            anchor: src_anchor,
            dst_chain: dst_chain_id,
            dst_anchor,
            value: toNano('0.05'),
        });

        await waiting_for_confirm(seqno);
        console.log('enable destination path confirmed!');
    }

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
