# Ton Demo

A simple demo for developing on Bool Network.

## Installation

-   Clone this repository
    ```sh
    git clone https://github.com/boolnetwork/ton-hello-web3-demo.git
    cd ton-hello-web3-demo
    ```
-   Add dependencies
    ```sh
    npm install
    ```

## Environment

To use it, rename `.env.example` to `.env`.

## TON EVM Bridge

This article details the use of dynamic committees of Bool Network to implement Arbitrary Message Transmission between TON and EVM chains. The core contract for TON Chain is still in the early stages of development and we are eagerly looking forward to your valuable suggestions.

### Prerequisites

-   Have the knowledge that the EVM series of [Solidity](https://docs.soliditylang.org/en/v0.8.23/) smart contract language basic syntax, including variables, data types, functions, events, etc., also need to be familiar with the development and deployment of smart contracts, as well as understand the related development tools and libraries, this tutorial uses the hardhat development framework.
-   Basic syntax and features, development and deployment, tools and libraries of Ton's smart contract development language [FunC](https://docs.ton.org/develop/func/overview) are required, and this tutorial uses the blueprint development framework.
-   You may to understand the operating principle of the bool [dynamic committee](https://boolnetwork.gitbook.io/docs/concepts/dynamic-hidden-committee-dhc).

FunC and solidity are two different smart contract languages, each with separate execution engines, resulting in huge differences in data types, structures, and function calls, which pose a huge challenge for cross-chain execution. In order to eliminate the influence of BOOL dynamic committee on data transmission of heterogeneous chains, we specify a set of [data conversion specification](#to_dcs) between TON-EVM. Be sure to read it carefully as it relates to your TON contract data parsing logic.

### Operation process

Building a set of TON-EVM heterogeneous chain bridge can be divided into the following aspects.

1. Apply for dynamic committees on the BOOL chain and create cross-chain Bridges
2. Deploy consumer contracts on the EVM chain and configure contracts
3. Deploy consumer contracts on the TON chain and configure contracts

For developers who are new to BOOL cross-chain, it is recommended to refer to [advanced solidity tutorials](https://github.com/boolnetwork/advanced-solidity-tutorials), which contains detailed instructions on the first and second aspects.

When you have completed the above configuration, the next steps are required on the TON chain:

1. Go to [Minter](https://minter.ton.org/?testnet=true) to create your Jetton. Deploy an `eddsa` anchor to the bridge at BoolScan.
2. Deploy your contract, here we use the `JettonBridge` example.
3. Update the consumer address of the Anchor object in the Messenger contract.
4. Update the Anchor address of the EVM target chain of the anchor object in the Messenger contract.
5. Sends a Jetton to the EVM target chain.


#### Example on Ton Side

Update `.env`.

```text
TON_ANCHOR_ADDRESS="0x1853cedb5972c7dfc433825b1277409f71e5593560b2787a57669b9c854f5058"
EVM_CHAIN_ID=421613
EVM_ANCHOR_ADDRESS="0x79d1378132e6cab941ca46650bebee19574921d3"
MESSENGER_ADDRESS='EQCsEJfDuKKEkWT7Gjf0rGjF8XkM3Ugb4zF7SIOlXbdJnVJk'
JETTON_MINTER_ADDRESS='EQBG8HUCjiYG_HL3asFXbyfoJP5B7E7HDpcDAVqi5okw80eZ'
```

The execution script of Steps 2 to 4:

```shell
npm run deployJettonBridge
```

The execution script for Step 5: Burn jetton and receive them on Arbitrum Goerli.

```shell
npm run sentJetton
```

#### Example on EVM Side

Configure the "remote anchors" to support ton testnet on evm side. `TON_TESTNET` chain id is `2591988700`;

```shell
yarn hardhat updateRemoteAnchor --anchor 0x79d1378132e6cab941ca46650bebee19574921d3 --id 2591988700 --remoteanchor 0x1853cedb5972c7dfc433825b1277409f71e5593560b2787a57669b9c854f5058 --network arbitrum_goerli
```

Deposit tokens on Arbitrum Goerli and mint them on ton testnet.
>>> use [ton address](https://ton.org/address/) tool to Obtain the 32-byte TON hash.
>>> Example recipient of ton: 0QAFGo9ad9sSWX53afYH0TRSmJuQpbgs4pTHaWk2SeooT6e7, we will get 0x051a8f5a77db12597e7769f607d13452989b90a5b82ce294c769693649ea284f

```shell
yarn hardhat tokenBridgeDeposit --amount 1000000000 --bridge 0x565D09b0cd1c8B7Ca4846c06cc9Ec4a92a01012d --id 2591988700 --recipient 0x051a8f5a77db12597e7769f607d13452989b90a5b82ce294c769693649ea284f --network arbitrum_goerli
```

## TON's consumer contract

A complete cross-chain process relies on inter-calls between the BOOL `Messenger` contract and the consumer contract on the TON chain, the consumer contract has at least two send and receive operations.

#### **Send class operation**

After the sending operation of the consumer contract completes the user-defined logic, the `Messenger` contract must be notified according to the specification, otherwise the BOOL system will not identify the transaction as a legitimate cross-chain transaction.

The notification data to `Messenger` must be assembled as follows:

```text
begin_cell()
.store_slice(sender_address)
.store_uint(PURE_MESSAGE, 256) ;; cross_type
.store_ref(begin_cell().end_cell()) ;; extra_feed
.store_uint(dst_chain_id, 32)
.store_ref(payload)
.store_uint(ctx_anchor, 256)
.end_cell();
```

-   **sender_address**：The sender's address
-   **PURE_MESSAGE**： A fixed constant type
-   **extra_feed**：The additional data needed needs to be known by the EVM chain
-   **dst_chain_id**： Destination EVM chain id
-   **payload**：Execution data sent to the EVM chain
-   **ctx_anchor**：The anchor address of the current chain

### **Receive class operations**

The internal function call of the consumer contract must implement the `consumer::receive_message_from_messenger` operation to receive the internal Message of cross-chain transactions initiated from the `Messenger` contract. Alternatively, you can optionally implement the `consumer::send_message_result_from_messenger` operation to receive an internal Message from the `Messenger` contract that completes a cross-chain transaction.

Note: Users need to interpret internal messages initiated by `Messenger` according to standard data structure definitions. The consumer contract must use `call_back_delivered_status_to_messenger` to callback the Messenger result after receiving an internal Message from `Messenger`, otherwise the BOOL system will not recognize the transaction as a legitimate cross-chain transaction.

TON's HelloWeb3 Key links is as follows:

-   [op::send_greeting](https://github.com/boolnetwork/ton-hello-web3-demo/blob/master/contracts/hello_web3.fc#L151)
-   [consumer::receive_message_from_messenger](https://github.com/boolnetwork/ton-hello-web3-demo/blob/master/contracts/hello_web3.fc#L176)
-   [consumer::send_message_result_from_messenger](https://github.com/boolnetwork/ton-hello-web3-demo/blob/master/contracts/hello_web3.fc#L216C15-L216C59)

<span id="to_dcs"></span>

### Data conversion specification

We defines the conversion specification between cells and Bytes on Func. It supports the conversion of buffers less than 1 MB in length into Func cells.

![cell_bytes](./images/cell_bytes.jpg)

**Rule**

1. Each cell stores only 32 bytes of data. If the number is less than 32 bytes, add 0 to 32 bytes at the end.
2. After all four refs of a cell are filled with data, the remaining data is filled into the last ref of the current layer.

**Usage scenario**

When a Bytes message is sent from Ton's consumer contract to the EVM chain, the bytes message should satisfy the 32-byte alignment format thrown event defined by BOOL, otherwise the commission will treat the transaction as illegal content and will not process it. For messages sent from the EVM chain to the consumer in Ton, the user should process the data in a 32-byte aligned Cell in the consumer contract.

The code [convert](https://github.com/boolnetwork/ton-hello-web3-demo/blob/master/convert.ts);
