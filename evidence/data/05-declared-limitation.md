# For the README's declared limitations

Both counterparties in the demo are ours. The invoice lives in an accounting demo company we
control, and the debtor is a teammate at a real address returning a real signature.

The mechanism is exercised end to end against real services and a real channel. What it
does not demonstrate is the adversarial case it is designed to close: collusion between a
business and its debtor. Proving that needs a debtor with no relationship to us, which a
hackathon demo cannot stage.

The registry's own guarantee is unaffected — it proves uniqueness, not existence — and this
is the honest boundary of the debtor-confirmation layer.

## A second boundary, on coverage

The screening list is a United States consolidation. It carries the Treasury, Commerce and
State lists, and it does not carry EU, UK or UN designations. A counterparty designated only
in Europe passes this check. Stated here rather than left for a reader to discover.

## A third boundary, on reaching the debtor

The confirmation email is sent from our own domain with DKIM, SPF and DMARC all in place, and
it is delivered. It is not reliably placed in an inbox: the first message the domain ever sent
landed in spam, because the domain has no sending reputation and three days is not enough to
build one.

For the demonstration this is handled the only honest way available — the recipients are known
to us and mark the message as legitimate. For a real deployment it is a genuine operational
requirement, not a detail: a debtor who never sees the request never confirms, and the
confirmation layer is only as strong as its weakest delivery path.
