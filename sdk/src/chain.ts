import { defineChain } from 'viem'

/**
 * Arc Testnet, written out because viem ships no definition for it — 599 chains, none matching this
 * id. The native currency is USDC at six decimals, not ether at eighteen, so anything that formats
 * a gas figure with the default assumption is wrong by twelve orders of magnitude.
 *
 * Multicall3 is declared because it is deployed at the canonical address on this chain. viem only
 * batches reads when the chain says so; without the declaration every read is its own round trip
 * and nothing reports the difference.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.io', 'https://rpc.drpc.testnet.arc.io'] },
  },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
  testnet: true,
})
