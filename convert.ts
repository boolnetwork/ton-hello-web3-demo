import { Cell, beginCell } from "@ton/ton";

const ALIGNED_BIT_SIZE: number = 256;
const ALIGNED_BYTE_SIZE: number = 32;

function plainToCellRecursive(data: Uint8Array): Cell {
    let cur = beginCell().endCell();
    while (data.length > 0 && cur.refs.length != 4) {
        let buf = data.slice(0, ALIGNED_BYTE_SIZE);

        // store buffer
        if (cur.bits.length == 0) {
            cur = cur.asBuilder().storeBuffer(Buffer.from(buf), ALIGNED_BYTE_SIZE).endCell();
        } else {
            const subCell = cur.refs.length == 3 ? 
                    plainToCellRecursive(data) : 
                    beginCell().storeBuffer(Buffer.from(buf), ALIGNED_BYTE_SIZE).endCell();
            cur = cur.asBuilder().storeRef(subCell).endCell();
        }
        data = data.subarray(ALIGNED_BYTE_SIZE);
    }

    return cur;
}

export function plainToCell(data: Uint8Array) {
    // ensure valid data length
    if (data.length % ALIGNED_BYTE_SIZE != 0) {
        console.log("invalid data length", data.length);
        throw new Error("invalid data length"); 
    }
    
    return plainToCellRecursive(data);
}

function cellToPlain(root: Cell) {
    let plainData: Buffer = Buffer.alloc(0);
    
    let stack: Cell[] = [];
    stack.push(root);

    while (stack.length > 0) {
        const currentCell = stack.shift()!;
        if (currentCell) {
            let data = currentCell.beginParse().loadBuffer(ALIGNED_BYTE_SIZE);

            const newLength = plainData.length + data.length;
            let newBuf = Buffer.alloc(newLength);
            newBuf.set(plainData);
            newBuf.set(data, plainData.length);
            plainData = newBuf;

            stack = currentCell.refs.concat(stack);
        }
    }

    return plainData;
}

async function test() {
    let l3 = beginCell().storeUint(BigInt(3), 256).endCell();
    let l2 = beginCell().storeUint(BigInt(2), 256).storeRef(l3).endCell();
    let l22 = beginCell().storeUint(BigInt(4), 256).endCell();
    let l1 = beginCell().storeUint(BigInt(1), 256).storeRef(l2).storeRef(l22).endCell();
    let cell = l1;
    console.log("cell.depth", cell.depth(), cell.level());
    console.log("cell:", cell);
    console.log("cell toBoc:", cell.toBoc({idx: true, crc32: false}).toString('hex'));
    console.log("cell to String:", cell.toString('hex'));

    let pd = cellToPlain(cell);
    console.log("pd:", Buffer.from(pd).toString('hex'));
    
    let pdd = Buffer.from('0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000c68656c6c6f2c20776f726c640000000000000000000000000000000000000000', 'hex');
    let c = plainToCell(pdd);
    console.log("plainToCell: ", c);
    console.log("cell refs num: ", c.refs.length);

    let tpd = cellToPlain(c);
    console.log("cellToPlain: ", Buffer.from(tpd).toString('hex'));
    let aaa = Buffer.from(tpd).toString('hex').toString();
    console.log("aaa:", aaa);
    console.log("is equal :", tpd.compare(pdd));
}

// test().then(() => process.exit(0))
//     .catch((error) => {
//         console.error(error);
//         process.exit(1);
//     });
