'use client'

import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { Alert } from '../../../components/alert'
import { Button } from '../../../components/button'
import { DataRow } from '../../../components/data-row'
import { Field } from '../../../components/field'
import { Icon } from '../../../components/icon'
import {
  type Address,
  POOL,
  type Position,
  encodeApprove,
  encodeDeposit,
  encodeRedeem,
  formatShares,
  formatUsdc,
  nextDepositStep,
  readAllowance,
  readPosition,
  validateRedeem,
} from './pool'

const CHAIN_ID = '0x4cef52'
const USDC = '0x3600000000000000000000000000000000000000'

type Stage = 'idle' | 'reading' | 'approving' | 'depositing' | 'redeeming' | 'error'

/**
 * Deposit, position and redeem against the pool, read straight from the chain and signed by the
 * visitor's own wallet.
 *
 * What is redeemable is not what the position is worth: the pool caps a redemption at the liquid
 * balance, because the rest is out on advances that have not been repaid. Showing only the value
 * would promise money the pool does not have today.
 */
export function Invest() {
  const { ready, authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const [position, setPosition] = useState<Position | undefined>()
  const [amount, setAmount] = useState('')
  const [shares, setShares] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [detail, setDetail] = useState('')
  const [hash, setHash] = useState('')

  const wallet = wallets[0]
  const address = wallet?.address as Address | undefined

  const refresh = async (who: Address) => {
    const read = await readPosition(who)
    setPosition(read)
    setStage('idle')
  }

  useEffect(() => {
    if (address === undefined) return
    // Through a promise, never straight from the effect body: a setState reachable synchronously
    // from an effect is a render-phase update, and the rule that forbids it is right.
    readPosition(address)
      .then((read) => setPosition(read))
      .catch((error: Error) => {
        setDetail(error.message)
        setStage('error')
      })
  }, [address])

  const send = async (to: string, data: string) => {
    const provider = await wallet?.getEthereumProvider()
    if (provider === undefined) throw new Error('No wallet is connected.')
    return (await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: address, to, data, chainId: CHAIN_ID }],
    })) as string
  }

  const deposit = async () => {
    if (address === undefined) return
    const assets = BigInt(Math.round(Number(amount) * 1e6))
    try {
      // The allowance decides which transaction comes first. Sending `deposit` without one reverts
      // inside the token, and the wallet reports it as a failure the visitor cannot act on.
      const allowance = await readAllowance(address)
      if (nextDepositStep(allowance, assets) === 'approve') {
        setStage('approving')
        setHash(await send(USDC, encodeApprove(assets)))
        return
      }
      setStage('depositing')
      setHash(await send(POOL, encodeDeposit(assets, address)))
      await refresh(address)
    } catch (error) {
      setDetail((error as Error).message)
      setStage('error')
    }
  }

  const redeem = async () => {
    if (address === undefined || position === undefined) return
    const requested = BigInt(Math.round(Number(shares) * 10 ** position.decimals))
    const refusal = validateRedeem(requested, position.redeemableAssets)
    if (refusal !== undefined) {
      setDetail(refusal)
      setStage('error')
      return
    }
    try {
      setStage('redeeming')
      setHash(await send(POOL, encodeRedeem(requested, address, address)))
      await refresh(address)
    } catch (error) {
      setDetail((error as Error).message)
      setStage('error')
    }
  }

  if (!ready) {
    return (
      <p className="mt-6 flex items-center gap-2">
        <Icon name="loading" /> Starting up.
      </p>
    )
  }

  if (!authenticated) {
    return (
      <div className="mt-6">
        <Button variant="primary" onClick={login}>
          <Icon name="wallet" /> Connect a wallet
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-6 flex max-w-3xl flex-col gap-6">
      <dl className="border border-border">
        <DataRow label="pool" value={POOL} />
        <DataRow
          label="pool holds"
          value={position === undefined ? '—' : formatUsdc(position.poolTvlAssets)}
        />
        <DataRow
          label="out on advances"
          value={position === undefined ? '—' : formatUsdc(position.outstandingPrincipal)}
        />
        <DataRow
          label="your shares"
          value={position === undefined ? '—' : formatShares(position.shares, position.decimals)}
        />
        <DataRow
          label="worth"
          value={position === undefined ? '—' : formatUsdc(position.valueAssets)}
        />
        {/* Not the same as `worth`, and the gap is the point: the rest is lent out. */}
        <DataRow
          label="redeemable now"
          value={position === undefined ? '—' : formatUsdc(position.redeemableAssets)}
        />
      </dl>

      <div className="flex flex-col gap-3">
        <Field
          label="Deposit, in USDC"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="1.000000"
          hint="The first deposit from a wallet needs an approval transaction before it."
        />
        <div>
          <Button variant="primary" onClick={() => void deposit()} disabled={stage !== 'idle'}>
            <Icon name={stage === 'idle' ? 'usdc' : 'loading'} />
            {stage === 'approving' ? 'Approving' : stage === 'depositing' ? 'Depositing' : 'Deposit'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Field
          label="Redeem, in shares"
          value={shares}
          onChange={(event) => setShares(event.target.value)}
          placeholder="1.0"
        />
        <div>
          <Button onClick={() => void redeem()} disabled={stage !== 'idle'}>
            <Icon name={stage === 'redeeming' ? 'loading' : 'repayment'} />
            {stage === 'redeeming' ? 'Redeeming' : 'Redeem'}
          </Button>
        </div>
      </div>

      {hash !== '' && (
        <p className="flex items-center gap-2 text-verified-text">
          <Icon name="verified" />
          <a
            href={`https://testnet.arcscan.app/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            {hash}
          </a>
        </p>
      )}
      {stage === 'error' && <Alert variant="error">{detail}</Alert>}
    </div>
  )
}
