import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4, Dictionary, toNano, beginCell, Address } from '@ton/ton';
import { Messenger } from '../wrappers/Messenger';
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
    const EVM_ANCHOR_ADDRESS = envs.EVM_ANCHOR_ADDRESS ?? '0x65fb860d54a5f175a68e09db5881f756e04ca657';
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
    const messengerContract = client.open(Messenger.createFromAddress(messengerAddress));

    const anchor = TON_ANCHOR_ADDRESS;
    const helloWeb3Code = await compile('HelloWeb3');
    const helloWeb3 = HelloWeb3.createForDeploy(helloWeb3Code, {
        messenger: messengerAddress,
        anchor: BigInt(anchor),
        counter: BigInt(0),
        map: Dictionary.empty(),
    });

    //// step1: deploy hello web3
    const helloWeb3Contract = client.open(helloWeb3);
    console.log('helloWeb3 contract address:', helloWeb3.address.toString());
    if (await client.isContractDeployed(helloWeb3.address)) {
        console.log('helloWeb3 already deployed');
    } else {
        console.log('deploy helloWeb3 contract......');
        const seqno = await walletContract.getSeqno();
        // send the deploy transaction
        await helloWeb3Contract.sendDeploy(walletSender, toNano('0.1'));

        // wait until confirmed
        await waiting_for_confirm(seqno);
        console.log('deploy helloWeb3 confirmed!');
    }

    //// step2: update consumer
    let src_anchor = BigInt(anchor);
    const consumer_before = await messengerContract.getConsumer(src_anchor);
    if (consumer_before.toString() == helloWeb3Contract.address.toString()) {
        console.log(`anchor ${src_anchor} consumer address was updated`);
    } else {
        console.log('call to messenger to update consumer addr about anchor');
        const seqno = await walletContract.getSeqno();

        await messengerContract.sendUpdateConsumer(walletSender, {
            anchor: src_anchor,
            new_consumer: helloWeb3Contract.address,
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
        console.log(`path ${dst_chain_id} for anchor ${helloWeb3Contract.address} was enabled`);
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

    //// step4: send hello world
    let buf = Buffer.from('hello world');
    let messageData = beginCell().storeBuffer(buf).endCell();

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
