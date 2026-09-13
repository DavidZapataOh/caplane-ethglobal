import { NextResponse } from 'next/server'
import { THRESHOLD_WEI } from './policy'
import { authenticatedUserId, privyClient } from './privy'
import { buildSignupPolicyRules } from './rules'

/**
 * Signing up an organization. Runs on the server because it needs the app secret, which never
 * reaches a browser.
 *
 * The policy is created before the wallet and passed as `policy_ids` on the creation request, which
 * is how Privy documents attaching guardrails to an organization wallet. Attaching afterwards would
 * be an update to a wallet the organization owns, and would leave a window — however short — in
 * which the organization has a wallet and no treasury rule.
 *
 * The wallet is created with `owner: null` explicitly, not omitted. Omitting it makes the
 * organization's key quorum the owner, and a quorum-owned wallet requires an authorization
 * signature on every signing call — measured against the live API, including in the very process
 * that generated the quorum's keys, if that call does not carry them. A server that discards those
 * keys after signup, as this one does, would hand each organization a wallet that can never sign
 * again. Spend control lives in the policy instead, where it can be changed without custody of
 * anything.
 *
 * The quorum is still created, because an organization cannot exist without one, and it stays as
 * the organization's administrative default for a future that wants multi-party approval of
 * policy changes. It is never a wallet owner.
 */

/** P-256 authorization keys, generated here and never persisted. */
const authorizationKey = async (): Promise<string> => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey)
  return Buffer.from(spki).toString('base64')
}

export async function POST(request: Request) {
  const privy = privyClient()
  if ((await authenticatedUserId(privy, request)) === undefined) {
    return NextResponse.json({ error: 'Sign in to create an organization.' }, { status: 401 })
  }

  const { name } = (await request.json()) as { name?: string }
  if (name === undefined || name.trim() === '') {
    return NextResponse.json({ error: 'An organization name is required.' }, { status: 400 })
  }

  const quorum = await privy.keyQuorums().create({
    public_keys: [await authorizationKey(), await authorizationKey()],
    authorization_threshold: 2,
    display_name: `${name} admins`,
  })

  const organization = await privy.organizations().create({
    display_name: name,
    default_key_quorum_id: quorum.id,
  })

  const policy = await privy.policies().create({
    name: `${name} treasury threshold`,
    version: '1.0',
    chain_type: 'ethereum',
    rules: buildSignupPolicyRules(THRESHOLD_WEI),
  })

  const wallet = await privy.wallets().create({
    chain_type: 'ethereum',
    entity: { id: organization.id, type: 'organization' },
    owner: null,
    policy_ids: [policy.id],
  })

  return NextResponse.json({
    id: organization.id,
    walletId: wallet.id,
    walletAddress: wallet.address,
  })
}
