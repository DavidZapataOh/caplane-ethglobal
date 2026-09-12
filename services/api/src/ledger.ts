/**
 * Resolves a counterparty's address from the accounting ledger, and nothing else.
 *
 * This is the only ledger credential in the whole system that lives on a platform surface, and it is
 * allowed there for one measured reason: its scope cannot reach an invoice. A token minted with the
 * scope below answers 401 to the invoice route — verified against the provider, not assumed. The
 * credential that can read an invoice stays in the vault and never touches this process.
 *
 * It is a separate connection with its own pair, deliberately disjoint in name, so the property is
 * one of the credential rather than of this file's good behaviour.
 */
export const CONTACTS_SCOPE = 'accounting.contacts.read'

const need = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`${name} is not set`)
  return value
}

export const tokenFor = async (): Promise<{ token: string; tenant: string }> => {
  const basic = Buffer.from(`${need('LEDGER_CONTACTS_ID')}:${need('LEDGER_CONTACTS_PASSPHRASE')}`).toString(
    'base64',
  )
  const minted = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&scope=${CONTACTS_SCOPE}`,
  })
  if (!minted.ok) throw new Error(`ledger token ${minted.status}`)
  const { access_token: accessToken } = (await minted.json()) as { access_token?: string }
  if (accessToken === undefined) throw new Error('ledger token carried no credential')
  const connections = await fetch('https://api.xero.com/connections', {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  })
  if (!connections.ok) throw new Error(`ledger connections ${connections.status}`)
  const [first] = (await connections.json()) as Array<{ tenantId?: string }>
  const tenant = first?.tenantId
  if (tenant === undefined) throw new Error('no ledger tenant')
  return { token: accessToken, tenant }
}

/**
 * The address the ledger holds for a contact.
 *
 * Undefined means the ledger answered and has none; a throw means it did not answer. The caller has
 * to tell those apart, because the first is a refusal to send and the second is worth retrying.
 */
export const contactEmailOf = async (contactId: string): Promise<string | undefined> => {
  const { token, tenant } = await tokenFor()
  const response = await fetch(`https://api.xero.com/api.xro/2.0/Contacts/${contactId}`, {
    headers: { authorization: `Bearer ${token}`, 'xero-tenant-id': tenant, accept: 'application/json' },
  })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`ledger contact ${response.status}`)
  const body = (await response.json()) as { Contacts?: Array<{ EmailAddress?: string }> }
  const email = body.Contacts?.[0]?.EmailAddress
  return email === undefined || email === '' ? undefined : email
}
