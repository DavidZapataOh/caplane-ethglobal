# Brand constraints for surfaces the package does not reach

## Architecture diagram (06/05) and README (06/07)

Paper mode. 1px strokes, no fill, zero radius, no shadow. Same six icon rules as the set:
viewBox 24, stroke 1.5, fill none, linecap butt, linejoin miter, currentColor.

The diagram appears in both the README (paper) and the landing (dark), so it must read
correctly on both grounds. Strokes only — a filled diagram cannot do that.

## Video (06/10)

Dark mode throughout. The only moment with colour is the second financier's rejection.

## Open question: the wordmark

The brand prohibits a seal usage "in the logo when on dark" but defines no logo — no lockup,
no clear space, no minimum size. Either the wordmark is "Caplane set in Martian Mono 500 at
-0.03em", which this package can ship as a component, or the landing has an unowned identity
gap in its hero. Nothing in the approved brand authorises designing one, so it is raised here
rather than decided.

## Licence notice for the README

Code is MIT. The three typefaces are SIL OFL 1.1 and their notices ship in the package:

  Copyright 2021 The Martian Mono Project Authors
  Copyright (c) 2017 IBM Corp. with Reserved Font Name "Plex"

No custom subsetter is run over IBM Plex. Subsetting counts as modification and "Plex" is a
Reserved Font Name, so a modified build could not keep the name. The font loader serves the
official webfonts untouched, which is why the question does not arise.

## What was corrected in the approved brand, and why

`--cp-text-3` in paper mode was `#6E6862`, which is **4.30:1** against the paper ground and
fails the 4.5:1 the brand claims for its text roles. It is the only paper token the document
left without an annotated ratio — the one nobody had computed. Changed to `#6A645E`, the
smallest darkening that clears the threshold, at 4.56:1.

This is what a recomputing test buys over a transcribing one. A test that compared the numbers
written in the document against the numbers written in the document would have passed.
