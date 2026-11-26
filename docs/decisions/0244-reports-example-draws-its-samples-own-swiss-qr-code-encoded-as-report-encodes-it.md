# 0244 — Formancy Report's example draws its sample's own Swiss QR Code, encoded as Report encodes it

- **Status:** accepted
- **Date:** 2026-11-26
- **Deciders:** Daniel Bacher
- **Supersedes in part:** [0242](0242-each-paid-module-has-a-product-page-sent-as-static-html-and-the-landing-page-shows-what-each-makes.md),
  whose sketch of Report's invoice left the QR-bill's code undrawn, a square with only the Swiss
  cross in it, so that nothing on the site could be scanned; the rest of 0242 stands
- **Verified by:** each watched failing on 2026-11-26, its fault planted once and the file put back
  byte for byte:
  - **`apps/site/src/site.test.tsx`**, *the paid modules' section*. *Draws the QR-bill's code as
    Report's encoder encodes the sample's payment data*: the modules the card's path draws are
    uqr's encoding of `PAYLOAD`, made in the test with SIX's options written out — level M, no
    quiet zone, the level never raised, version 25 at most — in SIX's black, and the caption says
    whose code it is and that no bank books its account. Failed with the code encoded at level L
    (`expected '0 0 57 57' to be '0 0 61 61'`) and with the modules drawn in grey
    (`the modules are black: expected '#333' to be '#000'`). *Draws a code a reader reads back as
    the payment data, at level M*: `src/testing/read-qr.ts`, a reader that shares no code with
    uqr, reads the drawn modules back to `PAYLOAD`. Failed with the code at level L
    (`a version 10 code at level L: this reads level M up to version 25`) and with the amount
    the code is encoded from changed to 1416.53 (`- 1416.52 + 1416.53`). *Draws the modules
    Report's published sample shows, whatever uqr the pin is moved to*: version 11, level M and
    mask 2, and the FNV-1a of the 3,600 modules outside the cross, `e833c655`, each as ZXing
    sampled them from Report's `docs/images/invoice-en.png`. Failed with uqr told to use mask 3 in
    the drawing and in the other tests' encoding alike, which those tests passed
    (`expected { version: 11, level: 'M', mask: 3 } to deeply equal { …, mask: 2 }`), and, with
    the mask's assertion taken out, on the fingerprint (`expected '1d68649d' to be 'e833c655'`).
    *Puts SIX's cross over the code's centre, 7 mm of its 46*: failed with the cross 35/8 mm long
    rather than 35/9 (`expected [ 27.599185, 33.400815, …(2) ] to deeply equal
    [ 27.921498, 33.078502, …(2) ]`), with its white square a module off the centre
    (`"centre": 31.5`) and with the cross drawn off-white (`and is white: expected '#eee' to be
    '#fff'`). *Draws each module's example in words and boxes* now allows one SVG in a figure,
    Report's code, hidden from assistive technology; failed, as `product-page.test.tsx`'s figure
    test did, with the code given `role="img"` instead (`expected [ 'mx-qr, aria-hidden null' ]
    to deeply equal [ 'mx-qr, aria-hidden true' ]`).
  - **`apps/site/src/product-page.test.tsx`**, *Formancy Report's page*. *Draws the same Swiss
    QR Code as the landing page's card*, the whole SVG as the build sends it: failed with the
    card encoding the number INV-2026-0319. *Prints on its slip what its code carries, as a real
    one does*: each element of SIX's Table 8 read from `PAYLOAD`, printed as SIX prints it, under
    its heading in each part, and the amount the invoice's total. Failed with the printed
    reference ending 03148 (`- "00 00000 00000 00000 02026 03184" + "… 03148"`) and with the
    payload's amount 1416.25 (`receipt: expected { Currency: 'CHF', Amount: '1 416.52' } to
    deeply equal { Currency: 'CHF', Amount: '1 416.25' }`). *Marks where its slip is separated,
    and names its parts and the receipt's acceptance point*: failed with the notice taken out
    (`expected undefined to be 'Separate before paying in'`) and with the acceptance point taken
    out (`expected undefined to be 'Acceptance point'`).
  - **`pnpm test:browser`** (`scripts/product-pages-browser-test.mjs`), its checks run alone
    against each planted build: on the landing page and on Report's page, at 320, 390, 820, 1180
    and 1440 pixels, every module of the code is at least 1.5 CSS pixels (failed at all five
    widths with the card's code at 5rem, the size 0242's square was: `a module of 1.31px`) and a
    whole number of them (failed at all five widths on both pages with the code at 7.5rem:
    `a module of 1.967px`); and nothing on the paper but the code comes within SIX's 5 mm of white
    around its 46, nor does the paper's edge (failed on Report's page at 820, 1180 and 1440 with
    the room to the code's right 0.3em: `within 5 mm of it: mx-slip-information, DIV, DD`).

  Nothing here reads Report's repository. That `PAYLOAD` is the text Report writes was shown once,
  on 2026-11-26, as the decision says, and nothing fails when Report changes it. That the code
  drawn is module for module the one Report's sample shows is held by the fingerprint taken from
  Report's picture that day, which a new picture of Report's does not move.

## Context

[0242](0242-each-paid-module-has-a-product-page-sent-as-static-html-and-the-landing-page-shows-what-each-makes.md)
drew Formancy Report's English invoice sample on the landing page's card and on `/products/report/`,
and where the renderer prints the Swiss QR Code it drew a square with only the Swiss cross in it,
and the words "The renderer draws the Swiss QR Code here", "so that nothing on this site can be
scanned or taken for a code somebody could pay". The share card Report's page is shown with has
the same square.

Looking at the landing page on 2026-11-26, the owner asked: "there is no qr code on the sample
invoice?" A QR-bill is its code before it is anything else, and a slip with an empty square on it
reads as a drawing nobody finished. Report's own published sample, `docs/images/invoice-en.png`
in its repository, shown at `formancy.ai/report/en/invoices/`, carries the real code, which ZXing
reads as the sample's payment data, the same data the drawing shows: SIX's example QR-IBAN
CH44 3199 9123 0008 8901 2, which no bank books; the invented firm Formancy Building Services AG
and customer Riverside Coffee Roasters AG; CHF 1 416.52; the reference 00 00000 00000 00000 02026
03184 and the additional information "Invoice INV-2026-0318". So the fear 0242 answered, a code
somebody could pay, is answered by the data, and the same code is already served on formancy.ai.

Read from formancy.ai-report's `main` (81405cb) on 2026-11-26: the sample is `invoice-en`,
`packages/report-corpus/src/starters/invoice.ts` over `invoice-words.ts`; its runtime writes the
code's text in `packages/report-runtime/src/qr-bill.ts`, each element of SIX's Table 8 on its line;
`swissSymbol` in `qr-symbol.ts` encodes it with uqr 0.1.3, which `report-runtime`'s manifest pins
exactly, as `report-render-pdf`'s does, at level M, with no quiet zone, the level never raised, in
the smallest version that holds it and never past 25; and `swissCodeContent` in
`report-render-pdf/src/qr.ts` draws it, white, its dark modules one path of a rectangle per run in
a row, and SIX's cross over the centre. Above the slip the sample prints *Separate before paying
in*, which SIX asks of a bill sent as a PDF (IG 3.7).

## Decision

**Report's example draws the sample's own Swiss QR Code**, on the card and on the page, as inline
SVG: `apps/site/src/module-examples/swiss-qr-code.tsx` encodes the text with uqr at exactly 0.1.3,
with Report's options, and draws it as Report's renderer does, the same rectangles, the same path
and the same cross, with `shape-rendering="crispEdges"`. Its black and white are written on the
shapes, as Report writes them, not taken from the paper's ink. Nothing is fetched
([0154](0154-the-website-makes-no-request-to-any-other-site.md)) and no element carries a style
attribute ([0243](0243-every-page-of-the-sites-own-build-is-sent-as-static-html-and-taken-over-as-sent.md)).

**The payload is the one source.** `PAYLOAD` in `report.tsx` is the text Report's runtime puts
into the sample's QR-bill, its 31 lines written out, with where and when it was read; the code is
encoded from it when the page is rendered, in Node for the HTML and again in the browser, and no
generated file stands beside it. It was shown to be Report's once, by running Report's own code,
read from a `git archive` of its `main` and bundled outside its repository, whose working tree
was left as it was: `resolveReport` over the sample's report and data gave this text; Report's
`swissSymbol` of it gave the 61 by 61 modules this site's encoding gives; and the paths and squares
of Report's `swissCodeContent` are the ones this site draws. Report's published `invoice-en.png`
reads as the same text, and its modules, as ZXing samples them outside the cross, are the same in
all 3,600 places; their fingerprint is in the site's tests.

**It is drawn at a size that reads as a code.** Version 11, 61 modules a side, each 0.125rem: 2 CSS
pixels at the default text size, on the card and on the page, at every width measured, where
0242's 5rem square would have made 1.31. At 2 pixels every module is a whole number of a screen's
pixels where a CSS pixel is one or two of them; 7.5rem made 1.97, and some rows and columns a pixel
narrower than the rest. On a page 34rem wide, 122 pixels is about SIX's 46 of 148 mm across the
payment part. The layout keeps SIX's 5 mm of white around the 46 mm code, a side times 5/46, clear
of any word, the receipt's dashed edge and the paper's edge. Screenshots in Chromium at a device
scale factor of 1, at 320, 560 and 1280 pixels, of the card and the page, and the share card, were
each read on 2026-11-26 as a QR code at level M, version 11, holding the payload, by ZXing
(`zxing-wasm` 3.1.5, the reader Report's own corpus reads its codes with), at their own scale and
with the cross over the centre, as it reads Report's `invoice-en.png`; and the modules it sampled
from each were the drawing's in all 3,600 places outside the cross. No phone has been pointed at
them for this record.

**The page's slip says what the code carries**, as a real one must and as Report's sample does:
the receipt its account and creditor, reference, debtor, currency, amount and acceptance point;
the payment part its account and creditor, reference, additional information, debtor, currency
and amount, in SIX's English headings; and above the slip SIX's notice, *Separate before paying
in*. The payment part's words stand beside the code down to a stage of 22rem and go under its
amount below that. The card keeps the two parts' titles, the code and the amounts. The words are
typed, as every other word of the sketch is, and the product page's test holds them to the
payload.

**The code is decoration to assistive technology**, `aria-hidden`, as formancy's own `qrcode` node
draws one ([0070](0070-a-code-is-an-arrangement-not-a-field.md)): a picture of a code says nothing
to a screen reader, and what it carries is printed beside it. The captions say it is the code the
sample carries, drawn with the encoder Report uses, that the firm and the customer are invented
and that the account is SIX's example QR-IBAN, which no bank books.

**uqr is a dependency of the site at exactly 0.1.3.** The rule for a new dependency is
`CLAUDE.md`'s: a runtime dependency of a package is named in
`docs/regulatory/SOUP-DECLARATION.md`, which `apps/docs/src/soup.test.ts` compares with every
manifest under `packages/` that is not private. `apps/site` is a private app, the website, and
delivered to nobody, so the SOUP table does not name its dependencies, and uqr already has its row
there as `@formancy/react`'s and `@formancy/angular`'s, at `^0.1.3`; the lockfile resolves the one
uqr 0.1.3 for all three. It is MIT, with no dependencies of its own. The pin is exact where the
site's others are ranges because the drawing is Report's only at Report's version: a later uqr is
free to choose another mask or another version for the same text, and the fingerprint fails one
that does.

## Consequences

**What it buys.** The example reads as finished and as what Report makes: a QR-bill with its code,
which ZXing read from Chromium's screenshots of the card and the page as the sample's bill, the
same one Report's own page shows, and the page's slip names what it carries beside it. The share
card Report's page is shown with, taken again as `docs/images/README.md` says, shows it too.

**What it costs.** Measured on 2026-11-26, on this branch's build against `main`'s, each file
gzipped by Node's zlib at level 9, in bytes, the scripts a page loads followed through their
imports. The landing page's `index.html` goes from 12,316 to 15,815 (+3,499; 47,906 to 61,237
raw), the code's path in its markup; the scripts it loads from 267,679 to 268,215 (+536), because
uqr was on the page already, in the chunk `@formancy/react` brings, and moves into a chunk of its
own, 3,736, that the landing page and Report's page share. `/products/report/`'s `index.html`
goes from 6,978 to 10,468 (+3,490) and its scripts from 84,856 to 89,266 (+4,410), uqr's chunk
most of it. The other choice measured, a generated module committed beside the payload with uqr
as a development dependency, cost the same in HTML and, in scripts, +1,557 on each page with the
modules as 61 strings of digits, or +3,583 with the path itself: a kilobyte more on the landing
page than this, and about 2.8 kB less on Report's page. The landing page decided it.

Nothing here reads Report again. If Report's sample changes, or the runtime writes its text
otherwise, a later version of SIX's guidelines among the reasons, the drawing goes on being a code
Report's sample no longer carries, and no gate here fails: the tests hold the drawing and the
slip's words to `PAYLOAD`, and `PAYLOAD` to Report only by the date beside it, as 0242's amounts
were. uqr is held to Report's picture: a uqr moved off 0.1.3 that encodes the text otherwise fails
the fingerprint, and one that encodes it the same passes.

The reader in `src/testing/read-qr.ts` reads what this site draws and nothing harder: a clean
symbol, at level M, up to version 25, in byte mode. It reads the modules from the drawing's path,
those under the cross included, and does not check the codewords that correct errors. So nothing
gates the picture: that the rendered code, with the cross over it, is read is the dated ZXing
reading above, and the browser gate measures a module and the quiet zone, not that anything reads
what it drew. On a phone's width, below a stage of 22rem, the page's slip puts what the code
carries under its amount, which no printed slip does.

The site now shows a working payment code. It is SIX's example account on an invented firm's bill,
the code Report's own page already serves; whatever reads it reads that bill.

**What it forecloses.** A Swiss QR Code in the examples that is not the sample's: another text,
another encoder, another version of uqr or other options, or a code drawn to look like one. A
code under 1.5 CSS pixels a module or between whole pixels, and a word or an edge within its quiet
zone. A page slip that prints something the code does not carry.

## Alternatives considered

**The square left as 0242 drew it.** Rejected: it is what prompted the question, and a slip without
its code reads as unfinished. Its reason, a code somebody could pay, does not hold for SIX's
example account on an invented firm's bill, which Report's own page serves already.

**Report's picture shown, copied or linked.** Rejected, as 0242 rejected pictures of the modules:
fetched, it is a request to another site (0154); copied, it is a file nothing here keeps true and
an image of text nobody can select. A share card is a picture, but of the site's own drawing.

**A code drawn to look like one**, random modules or a code of other text. Rejected: a payment code
that a reader reads as something else, or not at all, is a broken sample, and every value in the
examples is the module's own (0242).

**A generated module committed beside the payload, and a test that fails when it is not what a
script writes from it.** Measured above and not chosen: a kilobyte more of script on the landing
page, a file and a script to keep beside the payload, and uqr in the site's tests either way.

**A QR reader as a test dependency**, jsQR or zxing-wasm. Not done, at a cost: the reader the unit
tests need is about two hundred lines that share nothing with the encoder, and zxing-wasm is a
WebAssembly build for what those lines do on a clean symbol. But those lines read the drawing's
path, not its pixels, so the one property left to a dated observation, that the picture a browser
draws is read with the cross over it, is the one zxing-wasm in the browser gate, as a development
dependency, would hold, and nothing holds it now.

**The code drawn by script only, after the page is taken over, to keep its path out of the HTML.**
Rejected: it would save the 3.5 kB of markup, but the page would be sent without its code, which
0243 decided a page's first render may not do, and a reader without script would meet the empty
square again.

**A smaller code on the card, nearer 1.5 pixels a module**, to keep the card as short as it was.
Not chosen: at 2 pixels a module every module is a whole number of a screen's pixels where a CSS
pixel is one or two of them, and at 1.5 it is not.

**A larger code on the page, 3 pixels a module, SIX's 46 mm at 96 pixels to the inch.** Not
chosen: on a page 34rem wide the payment part is about 383 pixels, of which SIX's proportions give
the code 119; at 183 what the code carries would be squeezed into what was left beside it, and the
slip would outgrow its 105 mm of the page.
