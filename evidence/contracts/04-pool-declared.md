# For the README's declared limitations

## The registry is ours; the money is Circle's

"Nobody, including us, can alter an entry" is a claim about the lien registry, and it holds: the
registry has no owner, no pause and no upgrade path, and its only writer is a DON-consensused
report from an attested enclave.

It is not a claim about custody of the USDC, and it must not be read as one. On Arc the token is
a Circle proxy, and three powers sit behind it. Queried on Arc Testnet rather than assumed, every
one of them is held today by a plain externally owned account — no contract code, so no timelock
and no multisig:

    admin()          0x49f78af090F1f98e7184B7f61f1F1a8a8064b40d   no code, nonce 2
    blacklister()    0x9338f53291715F1126291E28BBd3B9989e966572   no code, nonce 27
    pauser()         0xbc639a0A060E5831a7c437b491B8d3C1f58F554e   no code, nonce 0
    owner()          0xDC29Bab4A7d5425cA44eeF20a5B67E3D897F9a03   no code, nonce 6

The blocklister can freeze an address. On this chain that is stronger than it sounds elsewhere:
balances are native, the check runs in a precompile below the EVM, and a blocked address can
neither send nor receive by any path and cannot pay gas, because gas is the same balance. A
blocked pool is inert, not merely unable to move tokens.

The pauser can halt every ERC-20 movement. Deposits, redemptions, disbursements and repayments
all stop; plain native transfers keep working, so the pool's assets can still change while the
pool cannot act on them.

The proxy admin can replace the token implementation in one transaction.

None of the three can alter a lien, forge a report, or make the registry say something that did
not happen. The honest sentence is that the ledger is beyond anyone's reach and the dollars are
not, and any system settling in a regulated stablecoin inherits that.

## A default is a loss, taken in full, by whoever holds shares

There is no first-loss tranche, no reserve, no insurance and no recovery process. When the
registry marks a lien defaulted — which only a signed report can do, and only after the term has
passed — the advance's principal is removed from the pool's assets and the price of a share
falls by that much.

The write-down is triggered by anyone, because there is nobody privileged to trigger it. Between
the moment a default becomes true and the moment someone calls for it, the pool still values the
advance at face and a redemption in that window leaves at the old price, at the expense of those
who stay. The window is real. What limits it is that calling costs 33,088 gas — under a
thousandth of a dollar — and every remaining shareholder has a reason to call.

A lien the registry marks released without ever being repaid is written down the same way. The
registry's release branch cannot know whether this pool funded the advance, so without that path
the principal would sit in the pool's books for ever and the last redeemer would pay for it.

We are not pretending this is a credit model. It is the smallest honest accounting of a loss
that a vault with no administrator can perform.

## What a share can be redeemed for today is not what it is worth

Capital that is out on an advance is still the investors', and it is counted. It is not
available. `maxRedeem` and `maxWithdraw` therefore report what idle cash can actually pay right
now, which during an active advance is less than a holder's full balance. That is the standard's
intent and not a limitation of this vault, but it surprises people, so it is written here.

One consequence of the powers above meets the standard head on: `maxRedeem` reads the token to
learn what is idle, and the standard says it must never revert. If the issuer pauses the token
or blocks this address, that read fails and a function the standard promises always answers stops
answering. Nothing in a vault can prevent that, and no vault settling in this asset can.

## The interest is what the chain can compute, not what the term sheet says

`rateBps` is documented as basis points of the advance against face value, and face value never
reaches the chain: the claim's amount lives inside a peppered commitment. The only expression
the chain can form from what the registry holds is the advance times the rate, and that is what
is charged. The division truncates, so a one-unit advance at one basis point carries no fee at
all — irrelevant at this demo's scale, and the only sharp edge in the formula.

## Rounding

The standard requires rounding to favour the vault, and this one does. A deposit followed
immediately by a redemption returns no more than was put in. With an eighteen-decimal share over
a six-decimal asset, the difference is on the order of a millionth of a millionth of a millionth
of a dollar — below anything USDC can represent. The claim is not that rounding is absent; it is
that it never runs in the user's favour, and never in a magnitude anyone can observe.
