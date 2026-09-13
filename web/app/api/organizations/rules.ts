type Condition = {
  field_source: 'ethereum_transaction'
  field: 'value'
  operator: 'lt' | 'gte'
  value: string
}

export type PolicyRule = {
  name: string
  method: 'eth_signTransaction'
  action: 'ALLOW' | 'DENY'
  conditions: Condition[]
}

/**
 * The two rules a new organization's treasury starts with.
 *
 * Evaluation is deny-by-default per method, so the ALLOW is not decorative: without it a transfer
 * under the threshold would be refused too, and the refusal would be attributable to "no rule
 * matched" rather than to the threshold this policy exists to enforce. Demonstrating a control
 * means both outcomes have to be traceable to a named rule.
 *
 * `lt` below and `gte` at or above: every amount matches exactly one of the two, with the
 * threshold itself falling on the deny side. Compared on `value`, the native amount in wei.
 */
export const buildSignupPolicyRules = (thresholdWei: bigint): PolicyRule[] => [
  {
    name: 'Allow transfers under the threshold',
    method: 'eth_signTransaction',
    action: 'ALLOW',
    conditions: [
      {
        field_source: 'ethereum_transaction',
        field: 'value',
        operator: 'lt',
        value: thresholdWei.toString(),
      },
    ],
  },
  {
    name: 'Deny transfers at or above the threshold',
    method: 'eth_signTransaction',
    action: 'DENY',
    conditions: [
      {
        field_source: 'ethereum_transaction',
        field: 'value',
        operator: 'gte',
        value: thresholdWei.toString(),
      },
    ],
  },
]
