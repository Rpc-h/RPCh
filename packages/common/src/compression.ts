import {
  JSONObject,
  CompressedPayload,
  Dictionary
} from "./types";

/**
 * Dictionaries used to compress and decompress RPC keys and methods 
 */

const propertiesMap : Dictionary = {
  0: 'id',
  1: 'params',
  2: 'method',
  3: 'result',
  4: 'error',
  5: '__jsonclass__',
  6: 'version',
  7: 'kwparams',
  8: 'jsonrpc',
}

const errorPropertiesMap : Dictionary = {
  0: 'code',
  1: 'name',
  2: 'message',
  3: 'error',
  4: 'at',
  5: 'text',
}

const resultPropertiesMap : Dictionary= { //params: [ too
  0: 'hash',
  1: 'from',
  2: 'to',
  3: 'expiry',
  4: 'sent',
  5: 'ttl',
  6: 'topics',
  7: 'payload',
  8: 'workProved',
  9: 'difficulty',
  10:'extraData',
  11:'gasLimit',
  12:'gasUsed',
  13:'hash',
  14:'logsBloom',
  15:'miner',
  16:'mixHash',
  17:'nonce',
  18:'number',
  19:'parentHash',
  20:'receiptsRoot',
  21:'sha3Uncles',
  22:'size',
  23:'stateRoot',
  24:'timestamp',
  25:'totalDifficulty',
  26:'transactions',
  27:'transactionsRoot',
  28:'uncles',
  29:'blockHash',
  30:'blockNumber',
  31:'from',
  32:'gas',
  33:'gasPrice',
  34:'hash',
  35:'input',
  36:'nonce',
  37:'to',
  38:'transactionIndex',
  39:'value',
  40:'startingBlock',
  41:'currentBlock',
  42:'highestBlock',
  43:'blockHash',
  45:'blockNumber',
  46:'contractAddress',
  47:'cumulativeGasUsed',
  48:'effectiveGasPrice',
  49:'from',
  50:'gasUsed',
  51:'logs',
  52:'logsBloom',
  53:'status',
  54:'to',
  55:'transactionHash',
  57:'transactionIndex',
  58:'type',
  59:'code',
  60:'info',
}

const methodMap : Dictionary = {
  0:'web3_clientVersion',
  1:'web3_sha3',
  2:'net_version',
  3:'net_listening',
  4:'net_peerCount',
  5:'eth_protocolVersion',
  6:'eth_syncing',
  7:'eth_coinbase',
  8:'eth_mining',
  9:'eth_hashrate',
  10:'eth_gasPrice',
  11:'eth_accounts',
  12:'eth_blockNumber',
  13:'eth_getBalance',
  14:'eth_getStorageAt',
  15:'eth_getTransactionCount',
  16:'eth_getBlockTransactionCountByHash',
  17:'eth_getBlockTransactionCountByNumber',
  18:'eth_getUncleCountByBlockHash',
  19:'eth_getUncleCountByBlockNumber',
  20:'eth_getCode',
  21:'eth_sign',
  22:'eth_signTransaction',
  23:'eth_sendTransaction',
  24:'eth_sendRawTransaction',
  25:'eth_call',
  26:'eth_estimateGas',
  27:'eth_getBlockByHash',
  28:'eth_getBlockByNumber',
  29:'eth_getTransactionByHash',
  30:'eth_getTransactionByBlockHashAndIndex',
  31:'eth_getTransactionByBlockNumberAndIndex',
  32:'eth_getTransactionReceipt',
  33:'eth_getUncleByBlockHashAndIndex',
  34:'eth_getUncleByBlockNumberAndIndex',
  35:'eth_getCompilers',
  36:'eth_compileSolidity',
  37:'eth_compileLLL',
  38:'eth_compileSerpent',
  39:'eth_newFilter',
  40:'eth_newBlockFilter',
  41:'eth_newPendingTransactionFilter',
  42:'eth_uninstallFilter',
  43:'eth_getFilterChanges',
  44:'eth_getFilterLogs',
  45:'eth_getLogs',
  46:'eth_getWork',
  47:'eth_submitWork',
  48:'eth_submitHashrate',
  49:'db_putString',
  50:'db_getString',
  51:'db_putHex',
  52:'db_getHex',
  53:'shh_version',
  54:'shh_post',
  55:'shh_newIdentity',
  56:'shh_hasIdentity',
  57:'shh_newGroup',
  58:'shh_addToGroup',
  59:'shh_newFilter',
  60:'shh_uninstallFilter',
  61:'shh_getFilterChanges',
  62:'shh_getMessages',
}

/**
 * Functions used to compress and decompress RPC requests 
 */

export default class Compression {

  public static compressRpcRequest(requestBody: JSONObject): CompressedPayload {
    let clientResponse : CompressedPayload = '00000';
    let jsonTmp : JSONObject = JSON.parse(JSON.stringify(requestBody));

    const jsonKeys : string[] = Object.keys(requestBody);

    //Compress Method
    if(jsonKeys.includes('method')) {
      const method : string = requestBody['method'];
      const methodId = Compression.getCompressedKeyId(method, methodMap);

    }

    for(let i = 0; i < jsonKeys.length; i++) {
      const originalValue : string = jsonKeys[i] ;
      const keyId = Compression.getCompressedKeyId(originalValue, propertiesMap);
      if(!keyId) continue;

      // @ts-ignore-start
      delete jsonTmp[originalValue];
      // @ts-ignore-end
      jsonTmp

    }



    return clientResponse;
  }


  private static getCompressedKeyId(key: string, dictionary: Dictionary): string | null {
    let id = null;
    const dictionaryKeys : string[] = Object.keys(dictionary);

    for(let i = 0; i < dictionaryKeys.length; i++) {
      if(key === dictionaryKeys[i]) {
        id = key;
        break;
      }
    }

    return id;
  }

}
