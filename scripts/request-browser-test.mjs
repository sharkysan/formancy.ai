/**
 * formancy.ai asks no other site for anything (0154).
 *
 * Every page of the site loaded its type from Google Fonts, and the playground loaded its
 * editor from jsDelivr, so opening any of them told two companies the visitor's address
 * before they had read a word. Nothing could say so: every other gate resolves a page
 * without a network, and a request that fails is a page that still renders, in a fallback
 * face and with an editor that never arrives.
 *
 * So each page is opened with every request routed through here, and anything addressed
 * to an origin other than the test server's is **aborted and recorded** — never let
 * through. That keeps the answer the same on a machine with no network, in CI and behind
 * a proxy: what a page asks for next depends on what answered — `fonts.gstatic.com` only
 * once `fonts.googleapis.com` has sent a stylesheet naming it — so a recorder that let
 * requests out would name different hosts on different networks, and tell each of them
 * about the machine running it.
 *
 * Routed on the context rather than the page, so the Angular page's frame is covered —
 * and the case checks that it saw the frame's own requests, because a recorder that
 * silently missed a frame would report a clean page.
 *
 * Two things a route never sees are read from the document instead: a `preconnect` or
 * `dns-prefetch` hint opens a connection to its host without making a request, and that
 * connection carries the visitor's address just the same.
 *
 * And because a page that simply stopped loading its fonts, or its editor, would pass all
 * of that, each page is also asked whether what it used to fetch elsewhere arrived from
 * here: its text is drawn in a face the document loaded, and the playground's schema
 * editor is Monaco. The playground, which renders documents other people wrote, is also
 * asked whether its content security policy refuses what such a document could ask for.
 *
 * And the playground is opened a second time to describe a change and carry the model's
 * turn by hand (0160), once in each builder: the request copied, an answer pasted back, the
 * review read and applied. Its model is a person because the site may call none, so the round trip is the
 * one flow on the page that exists to take something elsewhere — and the person does
 * that, not the page. Whatever the page sends while it happens is counted like the rest.
 * Then once more, asked in one builder and answered in the other, because the page holds
 * the run and a turn now outlives the pane that asked (0163). Before all of that, a
 * translation is carried the same way — French asked for in React, answered in Angular —
 * because the page holds that run too (0164).
 */

/**
 * The pages, and what each one has to have finished before its requests are counted.
 *
 * One of each kind the composed site serves: the landing page, the two pages beside it,
 * the playground and one page of the documentation, which is a different build (Astro)
 * with its own head.
 */
const PAGES = [
  { path: '/', settle: scrollThrough, ownFaces: true },
  { path: '/templates/', settle: (page) => page.getByRole('heading', { level: 1 }).waitFor(), ownFaces: true },
  { path: '/angular-form-builder/', settle: openTheStarter, ownFaces: true, frame: '/angular-form-builder/demo/' },
  { path: '/playground/', settle: openTheSchemaEditor, ownFaces: true, editor: true, policy: true },
  // The same page, with a model's turn carried through it: the clipboard is the page's own
  // origin's to write, as a visitor's browser lets it be.
  { path: '/playground/', label: '/playground/ carrying a model’s turn in each builder, and across a switch', settle: carryATurn, ownFaces: false, clipboard: true },
  // A page with code on it, which is where a documentation theme reaches for a highlighter.
  { path: '/docs/start/react/', settle: scrollThrough, ownFaces: false },
]

/** Down the page and back, so whatever loads lazily near the viewport has been asked for. */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8))
    for (let at = 0; at < document.documentElement.scrollHeight; at += step) {
      window.scrollTo(0, at)
      await new Promise((done) => setTimeout(done, 60))
    }
    window.scrollTo(0, 0)
  })
}

/** The starter is in a lazy frame: brought into view, and waited for until it has rendered. */
async function openTheStarter(page) {
  const frame = page.locator('iframe[src*="/angular-form-builder/demo/"]')
  await frame.scrollIntoViewIfNeeded()
  await page
    .frameLocator('iframe[src*="/angular-form-builder/demo/"]')
    .getByRole('tree')
    .first()
    .waitFor({ timeout: 30_000 })
}

/**
 * The playground with its schema editor open.
 *
 * The editor is only drawn in Schema mode, but Monaco is asked for when the page mounts —
 * so the request happens either way, and opening the mode is what lets the case below see
 * whether the editor arrived. Bounded: on a page whose editor was refused, the wait ends
 * and the case says so rather than hanging the gate.
 */
async function openTheSchemaEditor(page) {
  await page.waitForSelector('[data-formancy-part="signature-surface"]', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Schema', exact: true }).click()
  await page.waitForSelector('.monaco-editor', { timeout: 15_000 }).catch(() => undefined)
}

/**
 * A model's turn, carried by hand through the playground's relay (0160), in each builder.
 *
 * Describe a change; the relay pane shows the request; Copy puts it on the clipboard, read
 * back here as a visitor's paste would read it; an answer is pasted the way a chat gives
 * one — a sentence, then the document in a code fence — and checked; the review appears,
 * and Apply puts the field in the tree. The link to the chat is looked at and never
 * followed: a link is navigation the visitor chooses, and following it would be the gate
 * making the request it exists to refuse.
 *
 * Then again with the Builder select on Angular, whose relay pane is its own markup and
 * its own Copy. Carried through React alone, a gate that counts every request let an
 * Angular pane that posted the request elsewhere on Copy, and opened the chat itself,
 * through as a page that asked no other site for anything.
 *
 * And a third time across the switch: asked in Angular, the Builder select put back on
 * React while the turn is with the chat, and the answer pasted into React's relay pane and
 * applied there. The run is the page's (0163); when it was the prompt pane's, the switch
 * stopped it and the paste found nothing waiting.
 *
 * Returns what it found, as checks, so a step that did not happen is a named failure
 * rather than a page that asked nobody anything because nothing was done on it.
 */
async function carryATurn(page) {
  const found = []
  try {
    await page.waitForSelector('[data-formancy-part="signature-surface"]', { timeout: 30_000 })
  } catch (error) {
    return [['the playground opened, to carry a model’s turn through it', String(error).split('\n')[0]]]
  }
  // First, while the starter still has its half-finished French: the prompt turns below
  // replace the whole form with one that has no catalogue.
  await carryATranslation(page, found)
  const phone = { key: 'phone', type: 'text', label: 'Telephone' }
  await carryOne(page, found, { where: 'in the React builder', ask: 'add a phone number', word: 'phone', fields: [phone], shows: /Telephone/ })
  try {
    await page.getByRole('combobox', { name: 'Builder' }).selectOption('angular')
  } catch (error) {
    found.push(['the Builder select switches to Angular', String(error).split('\n')[0]])
    return found
  }
  const fax = { key: 'fax', type: 'text', label: 'Fax number' }
  await carryOne(page, found, { where: 'in the Angular builder', ask: 'add a fax number', word: 'fax', fields: [phone, fax], shows: /Fax number/ })
  const email = { key: 'email', type: 'text', label: 'Email address' }
  await carryOne(page, found, {
    where: 'asked in the Angular builder and answered in the React one',
    ask: 'add an email address',
    word: 'email',
    fields: [phone, fax, email],
    shows: /Email address/,
    between: () => page.getByRole('combobox', { name: 'Builder' }).selectOption('react'),
  })
  return found
}

/**
 * A translation's turn, carried across a switch of builder (0164).
 *
 * The French the starter is missing, asked for under *Translations* in React; the Builder
 * select put on Angular while the turn is with the chat; the Angular tab opening on French
 * over the same request; the answer — the request's own catalogue file with every target
 * filled in, as a chat writes it — pasted into Angular's relay pane, reviewed and applied.
 * When the run was the review part's, the switch stopped it and the paste found nothing
 * waiting. Leaves the page on React, under *Fields*, for the turns that follow.
 */
async function carryATranslation(page, found) {
  const named = (what) => `a translation asked in the React builder and answered in the Angular one, ${what}`
  try {
    await page.getByRole('button', { name: 'Build', exact: true }).click()
    await page.getByRole('button', { name: 'Translations', exact: true }).click()
    const editor = page.getByRole('region', { name: 'Editor' })
    await editor.getByRole('combobox', { name: 'Language', exact: true }).selectOption('fr', { timeout: 30_000 })
    await editor.getByRole('button', { name: /^Ask a model for the \d+ missing messages?$/ }).click()

    const relay = page.getByRole('region', { name: 'Take this request to a model' })
    await relay.waitFor({ timeout: 15_000 })
    const shown = await relay.getByRole('textbox', { name: 'The request' }).inputValue()

    await page.getByRole('combobox', { name: 'Builder' }).selectOption('angular')
    // The Angular application's own Language select, not the React one it replaced.
    const angular = page.locator('formancy-playground-angular-builder')
    const language = angular.getByRole('combobox', { name: 'Language', exact: true })
    await language.waitFor({ timeout: 30_000 })
    const after = await angular.getByRole('textbox', { name: 'The request', exact: true }).inputValue({ timeout: 30_000 })
    const opened = await language.inputValue()
    found.push([
      named('the turn is still waiting after the switch, the same request, and the tab opens on French'),
      after === shown && opened === 'fr'
        ? null
        : `the request box held ${JSON.stringify(after.slice(-80))}, and the Language select ${JSON.stringify(opened)}`,
    ])

    // What a chat answers: the file it was given, every target written.
    const file = JSON.parse(shown.slice(shown.indexOf('{', shown.indexOf('The catalogue file to fill in:'))))
    const answer = {
      ...file,
      messages: file.messages.map(({ id, source }) => ({ id, source, target: `${source} (fr)` })),
    }
    const carried = angular.getByRole('region', { name: 'Take this request to a model' })
    await carried
      .getByRole('textbox', { name: 'The model’s answer' })
      .fill(`Voici le fichier :\n\n\`\`\`json\n${JSON.stringify(answer, null, 2)}\n\`\`\``)
    await carried.getByRole('button', { name: 'Check this answer', exact: true }).click()
    const review = angular.getByRole('region', { name: /^Review these translations into fr/ })
    await review.waitFor({ timeout: 15_000 })
    await review.getByRole('button', { name: 'Apply these translations', exact: true }).click()
    await review.waitFor({ state: 'detached', timeout: 15_000 })
    const written = await angular
      .locator('[data-formancy-part="translations-table"] input')
      .evaluateAll((inputs) => inputs.filter((input) => input.value.endsWith(' (fr)')).length)
    found.push([
      named('the answer pasted back was reviewed and applied'),
      written === answer.messages.length ? null : `${written} of ${answer.messages.length} messages read as written`,
    ])
  } catch (error) {
    found.push([named('a translation’s turn carried through the relay'), String(error).split('\n')[0]])
    // A turn left waiting would refuse every one that follows: another demo forgets it, and
    // the starter is chosen again for them.
    await page.getByRole('combobox', { name: 'Demo' }).selectOption('wizard').catch(() => undefined)
    await page.getByRole('combobox', { name: 'Demo' }).selectOption('starter').catch(() => undefined)
  } finally {
    // The turns that follow start in React, under Fields, so a failure here is named once
    // rather than as theirs too.
    await page.getByRole('combobox', { name: 'Builder' }).selectOption('react').catch(() => undefined)
    await page.getByRole('button', { name: 'Fields', exact: true }).click().catch(() => undefined)
  }
}

/**
 * One turn through whichever builder is on screen, its checks named after where it was
 * carried — and, given `between`, something done while the turn is with the chat, after
 * which the answer is pasted into whichever relay pane is on screen then.
 */
async function carryOne(page, found, { where, ask, word, fields, shows, between }) {
  const named = (what) => `${where}, ${what}`
  try {
    await page.getByRole('textbox', { name: /Describe the form/ }).fill(ask, { timeout: 30_000 })
    await page.getByRole('button', { name: 'Write it', exact: true }).click()

    const relay = page.getByRole('region', { name: 'Take this request to a model' })
    await relay.waitFor({ timeout: 15_000 })
    const shown = await relay.getByRole('textbox', { name: 'The request' }).inputValue()
    await relay.getByRole('button', { name: 'Copy the request', exact: true }).click()
    await relay.getByRole('status').filter({ hasText: /\S/ }).waitFor({ timeout: 5_000 })
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    found.push([
      named('the relay copies the whole request, briefing first, and the request it shows ends it'),
      copied.startsWith('You are writing a formancy form document') && copied.endsWith(`\n\n${shown}`) && shown.includes(ask)
        ? null
        : `the clipboard held ${JSON.stringify(copied.slice(0, 80))}…, and the box ${JSON.stringify(shown.slice(-80))}`,
    ])

    const chat = await relay.getByRole('link', { name: /in a new tab/ }).getAttribute('href')
    found.push([
      named('its link to a chat carries nothing of the request'),
      chat !== null && !chat.includes(word) && !chat.includes('?') ? null : `the link is ${String(chat)}`,
    ])

    if (between !== undefined) {
      await between()
      await relay.getByRole('textbox', { name: 'The request' }).waitFor({ timeout: 30_000 })
      const after = await relay.getByRole('textbox', { name: 'The request' }).inputValue()
      found.push([
        named('the turn is still waiting after the switch, the same request'),
        after === shown ? null : `the request box held ${JSON.stringify(after.slice(-80))}`,
      ])
    }

    const answer = JSON.stringify({ specVersion: '2', id: 'proposed', title: 'Proposed', model: { fields } })
    await relay
      .getByRole('textbox', { name: 'The model’s answer' })
      .fill(`Here is the form:\n\n\`\`\`json\n${answer}\n\`\`\``)
    await relay.getByRole('button', { name: 'Check this answer', exact: true }).click()
    await page.getByRole('heading', { name: /Review these changes/ }).waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Apply these changes', exact: true }).click()
    await page.getByRole('treeitem', { name: shows }).first().waitFor({ timeout: 15_000 })
    found.push([named('the answer pasted back was reviewed and applied'), null])
  } catch (error) {
    found.push([named('a model’s turn carried through the relay'), String(error).split('\n')[0]])
  }
}

export async function checkNoForeignRequests(browser, origin, check) {
  console.log('\nrequests to other sites')
  for (const { path, label = path, settle, ownFaces, frame, editor, policy, clipboard } of PAGES) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    // The page's own origin only, as a browser grants it to the site a visitor is on.
    if (clipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
    const foreign = new Set()
    const own = []
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin === origin) {
        own.push(url.pathname)
        return route.continue()
      }
      foreign.add(url.origin)
      return route.abort('blockedbyclient')
    })

    const page = await context.newPage()
    try {
      await page.goto(`${origin}${path}`, { waitUntil: 'load' })
      const settled = (await settle(page)) ?? []
      await page.waitForLoadState('networkidle')

      // Hints, from every frame: a connection opened is an address disclosed.
      for (const each of page.frames()) {
        const hinted = await each.evaluate(() =>
          [...document.querySelectorAll('link[rel~="preconnect"], link[rel~="dns-prefetch"]')].map(
            (link) => ({ href: link.href, rel: link.rel }),
          ),
        )
        for (const { href, rel } of hinted) {
          const at = new URL(href, origin)
          if (at.origin !== origin) foreign.add(`${at.origin} (a ${rel} hint)`)
        }
      }

      check(
        `${label} asks no other site for anything`,
        foreign.size === 0 ? null : `it asked ${[...foreign].sort().join(', ')}`,
      )
      check(
        `and the recorder saw ${label} ask this one, so it was listening`,
        own.length > 0 ? null : 'no request reached the route at all',
      )
      // What the settling found on the way: a step that did not happen is not a clean page.
      for (const [name, problem] of settled) check(name, problem)
      if (frame !== undefined) {
        check(
          'and it saw the embedded starter’s own requests, so a frame is covered',
          own.some((pathname) => pathname.startsWith(frame) && pathname !== frame)
            ? null
            : `nothing under ${frame} was routed besides the frame itself`,
        )
      }

      if (ownFaces) {
        /*
         * The text is drawn in a face this page loaded.
         *
         * The family is read from the cascade — the first one the heading and the body ask
         * for — and looked for among the document's loaded faces, so the case follows
         * whatever the stylesheet names rather than a list written here.
         */
        const faces = await page.evaluate(async () => {
          await document.fonts.ready
          const first = (element) =>
            element === null
              ? null
              : getComputedStyle(element).fontFamily.split(',')[0].replace(/["']/g, '').trim()
          const asked = [...new Set([first(document.querySelector('h1')), first(document.body)])].filter(
            (family) => family !== null,
          )
          const loaded = new Set(
            [...document.fonts]
              .filter((face) => face.status === 'loaded')
              .map((face) => face.family.replace(/["']/g, '')),
          )
          return { asked, missing: asked.filter((family) => !loaded.has(family)) }
        })
        check(
          `and ${path} draws its text in faces the document loaded: ${faces.asked.join(', ')}`,
          faces.missing.length === 0 ? null : `no loaded face for ${faces.missing.join(', ')}`,
        )
      }

      if (editor) {
        const drawn = await page.locator('.monaco-editor').count()
        check(
          'and the playground’s schema editor is Monaco, which arrived rather than being dropped',
          drawn > 0 ? null : 'no Monaco editor on the page in Schema mode',
        )
      }

      if (policy) {
        /*
         * And what a document asks for is held to this site by the page's own policy.
         *
         * The playground renders documents somebody else wrote, and an option's picture
         * may name any https host (0126), so what was checked above holds for the starter
         * and not for whatever is pasted in next. The policy is what holds it then, and it
         * is asked here as a browser answers it: a picture and a connection to another
         * host, from inside the page. Refused by the policy, neither reaches the route;
         * without it, both would, and be aborted and named above.
         */
        const before = new Set(foreign)
        const refused = await page.evaluate(async () => {
          const violated = new Set()
          document.addEventListener('securitypolicyviolation', (event) => violated.add(event.effectiveDirective))
          const picture = new Image()
          const settled = new Promise((done) => {
            picture.onload = done
            picture.onerror = done
          })
          picture.src = 'https://pictures.invalid/option.png'
          document.body.append(picture)
          await settled
          picture.remove()
          await fetch('https://answers.invalid/').catch(() => undefined)
          await new Promise((done) => setTimeout(done, 100))
          return [...violated].sort()
        })
        const leaked = [...foreign].filter((origin) => !before.has(origin))
        check(
          'and its policy refuses a picture or a connection on another host before it is made',
          leaked.length === 0 && refused.join(' ') === 'connect-src img-src'
            ? null
            : `${leaked.length === 0 ? 'nothing left the page' : `${leaked.join(', ')} reached the network`}, ` +
                `and the policy reported ${refused.join(', ') || 'nothing'}`,
        )
      }
    } finally {
      await context.close()
    }
  }
}
