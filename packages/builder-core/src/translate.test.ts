import { DECLINE_KEY } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import type { AuthoringPrompt } from './answers.js'
import { createStop, declinedAnswer } from './answers.js'
import { referencedMessages } from './logic.js'
import { createBuilderText } from './messages.js'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { BUILDER_MESSAGES_FR } from './messages-fr.js'
import { applyProposal } from './proposal.js'
import { createBuilderSession } from './session.js'
import {
  missingMessages,
  proposeTranslation,
  translateCatalogue,
  translationHeading,
  translationStatus,
  translationToReview,
} from './translate.js'
import type { TranslationAnswer } from './translate.js'
import { TRANSLATION_COMPLAINTS, translationComplaint, translationPrompt } from './translate-prompt.js'

/**
 * A model asked for the messages a language is missing (0161).
 *
 * The playground's starter has a French catalogue left half-finished on purpose, and the
 * Translations tab marks every message missing from it. Nothing helped fill them. A model
 * can — and a model's translation is a model's edit, so everything here is about what it
 * may touch and what a person sees before it lands: only the messages nobody has written,
 * never a rule or an answer in the request, the answer through the import's own rules, and
 * held for review as any proposal is.
 */
const order: FormSchema = {
  specVersion: '4',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      {
        key: 'country',
        type: 'select',
        label: { $t: 'country' },
        options: [
          { value: 'CH', label: { $t: 'country.ch' } },
          { value: 'DE', label: { $t: 'country.de' } },
        ],
      },
      { key: 'canton', type: 'text', label: { $t: 'canton' } },
      { key: 'email', type: 'text', label: { $t: 'email' } },
    ],
  },
  logic: {
    rules: [
      { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
      { target: 'canton', kind: 'required', cel: 'country == "CH" && email != ""' },
      { target: 'email', kind: 'validate', cel: 'email.endsWith("@example.org")', code: 'email.domain' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'section',
          label: { $t: 'section.where' },
          children: [
            { kind: 'field', path: 'country' },
            { kind: 'field', path: 'canton' },
            { kind: 'field', path: 'email' },
          ],
        },
      ],
    },
  ],
  i18n: {
    defaultLocale: 'en',
    messages: {
      en: {
        country: 'Country',
        'country.ch': 'Switzerland',
        'country.de': 'Germany',
        canton: 'Canton',
        email: 'Email',
        'section.where': 'Where it goes',
        // An orphan: no field refers to it any more, and somebody's French is kept for it.
        gone: 'A question nobody asks any more',
      },
      fr: { country: 'Pays', 'country.ch': 'Suisse', gone: 'Une question que plus personne ne pose' },
    },
  },
}

/** A model that answers each turn from the list, and records what it was asked. */
const scripted = (...answers: string[]) => {
  const asked: AuthoringPrompt[] = []
  const ask = (prompt: AuthoringPrompt): Promise<string> => {
    asked.push(prompt)
    return Promise.resolve(answers[asked.length - 1] ?? answers.at(-1) ?? '')
  }
  return { ask, asked }
}

/** The French a model would write for the starter's missing messages, by id. */
const FRENCH: Readonly<Record<string, string>> = {
  'country.de': 'Allemagne',
  // The same as its source, and right: the starter maps canton to "Canton".
  canton: 'Canton',
  email: 'Courriel',
  'section.where': 'Adresse de livraison',
}

/** A whole answer: the file the request held, every target written from `targets`. */
const answerWith = (
  targets: Readonly<Record<string, string>>,
  extra: ReadonlyArray<{ id: string; source: string; target: string }> = [],
  locale = 'fr',
): string => {
  const rows = translationPrompt(order, 'fr').rows
  return JSON.stringify({
    locale,
    defaultLocale: 'en',
    messages: [
      ...rows.map(({ id, source }) => ({ id, source, target: targets[id] ?? '' })),
      ...extra,
    ],
  })
}

describe('the request', () => {
  test('lists exactly the live messages with no target in the language, and never an orphan', () => {
    // Derived from the document, through `referencedMessages` — the logic panel's walk,
    // not the export's — so a request that sent every message, or the catalogue's keys
    // with the orphan among them, is caught by a second reading of the same form.
    const french = order.i18n!.messages['fr']!
    const expected = referencedMessages(order).filter((id) => french[id] === undefined)

    const request = translationPrompt(order, 'fr')

    expect(request.rows.map((row) => row.id)).toEqual(expected)
    expect(expected).toEqual(['country.de', 'canton', 'email', 'section.where'])
    // The orphan's words are nowhere in it: its French is somebody's kept work.
    const said = `${request.system}\n${request.user}`
    expect(said).not.toContain('A question nobody asks any more')
    expect(missingMessages(order, 'fr')).toEqual(expected)
  })

  test('says where each message is used, so a label stays a label', () => {
    // Prevents a row that says only "Germany": a model cannot tell an answer from a
    // heading from a country being asked about, and translates whichever it guesses.
    const contexts = Object.fromEntries(
      translationPrompt(order, 'fr').rows.map((row) => [row.id, row.context]),
    )

    expect(contexts).toEqual({
      'country.de': 'option of "Country"',
      canton: 'label of a text question "Canton"',
      email: 'label of a text question "Email"',
      'section.where': 'heading of a section of the form',
    })
    expect(translationPrompt(order, 'de').rows.find((row) => row.id === 'country')?.context).toBe(
      'label of a select question "Country"',
    )
  })

  test('gives every row a context, wherever in the form its message is used', () => {
    // Every place a message can be used, and one the spec does not have yet: a row with
    // no context is a row the model translates blind. The walk is the one that finds the
    // live messages, so a reference that one finds is one this one places.
    const everywhere = {
      specVersion: '4',
      id: 'everywhere',
      title: 'Everywhere',
      model: {
        fields: [
          {
            key: 'about',
            type: 'page',
            label: { $t: 'about' },
            fields: [
              { key: 'intro', type: 'static', label: { $t: 'intro' } },
              {
                key: 'delivery',
                type: 'radio',
                label: { $t: 'delivery' },
                options: [
                  {
                    value: 'express',
                    label: { $t: 'delivery.express' },
                    image: { src: '/express.svg', alt: { $t: 'delivery.express.alt' } },
                  },
                ],
              },
              {
                key: 'verdict',
                type: 'matrix',
                label: { $t: 'verdict' },
                rows: [{ value: 'taste', label: { $t: 'verdict.taste' } }],
                options: [{ value: 'fine', label: { $t: 'verdict.fine' } }],
              },
              {
                key: 'recipients',
                type: 'repeater',
                label: { $t: 'recipients' },
                widget: 'datagrid',
                columns: [{ field: 'amount', header: { $t: 'recipients.amount.short' } }],
                fields: [{ key: 'amount', type: 'number', label: { $t: 'recipients.amount' } }],
              },
              { key: 'billing', type: 'group', label: { $t: 'billing' }, fields: [] },
              // Somewhere the spec does not put words today.
              { key: 'later', type: 'text', label: 'Later', future: { $t: 'later.future' } },
            ],
          },
        ],
      },
      layouts: [
        {
          name: 'web',
          nodes: [
            {
              kind: 'tabs',
              label: { $t: 'tabs' },
              children: [
                {
                  kind: 'section',
                  label: { $t: 'tab.one' },
                  children: [
                    { kind: 'table', columns: 2, label: { $t: 'grid' }, children: [] },
                    { kind: 'qrcode', path: 'delivery', label: { $t: 'code' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
      i18n: { defaultLocale: 'en', messages: { en: {} } },
    } as unknown as FormSchema

    const rows = translationPrompt(everywhere, 'fr').rows

    expect(rows.map((row) => row.id)).toEqual(referencedMessages(everywhere))
    expect(rows.filter((row) => row.context.trim() === '').map((row) => row.id)).toEqual([])
    // Each in words of its own, rather than one sentence for everything.
    expect(new Set(rows.map((row) => row.context)).size).toBe(rows.length)
    expect(rows.find((row) => row.id === 'tab.one')?.context).toBe('name of a tab')
    expect(rows.find((row) => row.id === 'later.future')?.context).toBe('"future" of "Later"')
  })

  test('carries none of the form’s rules, only its words and where they are used', () => {
    // Read off the rules themselves rather than off a phrase: every expression, code and
    // check the document holds. A request that sent the document, as `authorForm` does,
    // would carry all of them to somebody else's model for no reason. Each is looked for
    // as written and as JSON writes it: the request is JSON, which escapes the quote in
    // `country == "CH"`, so a search for the raw expression alone passed with every rule
    // sent along.
    const request = translationPrompt(order, 'fr')
    const said = `${request.system}\n${request.user}`
    const ruleWords = (order.logic?.rules ?? []).flatMap((rule) =>
      [rule.cel, rule.code, rule.check].filter((value): value is string => value !== undefined),
    )
    const inJson = (words: string): string => JSON.stringify(words).slice(1, -1)
    const spellings = ruleWords.flatMap((words) => [words, inJson(words)])

    expect(ruleWords.length).toBeGreaterThan(0)
    // Some rule here is spelt differently in JSON, or the second spelling checks nothing.
    expect(ruleWords.some((words) => inJson(words) !== words)).toBe(true)
    expect(spellings.filter((words) => said.includes(words))).toEqual([])
    // And each row is the catalogue's three fields and where it is used — nothing else.
    for (const row of request.rows) expect(Object.keys(row).sort()).toEqual(['context', 'id', 'source', 'target'])
  })

  test('shows the translations the language already has, for the register to match', () => {
    // Prevents "vous" in one message and "tu" in the next: the form's own French is the
    // only evidence of how this form speaks to its reader.
    const user = translationPrompt(order, 'fr').user

    expect(user).toContain('"Country" → "Pays"')
    expect(user).toContain('"Switzerland" → "Suisse"')
  })
})

describe('asking a model', () => {
  test('keeps a whole answer, in one turn', async () => {
    // Prevents a whole and right answer costing another turn — through the relay, two more
    // pastes by hand — or coming back short: every target the model wrote is kept, and
    // nothing is listed as still missing.
    const model = scripted(answerWith(FRENCH))

    const result = await translateCatalogue(model.ask, order, 'fr')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attempts).toBe(1)
    expect(result.answer.stillMissing).toEqual([])
    expect(Object.fromEntries(result.answer.messages.map((m) => [m.id, m.target]))).toEqual(FRENCH)
  })

  test('asks again for a catalogue in the wrong language, and says only that', async () => {
    // Prevents German written into the French catalogue: a valid file, every id right,
    // and every word in the wrong language. And the complaint is that problem alone, as
    // `askChecked` gives it — a list of everything ever wrong sets a model fixing old ones.
    const model = scripted(answerWith(FRENCH, [], 'de'), answerWith(FRENCH))

    const result = await translateCatalogue(model.ask, order, 'fr')

    expect(result.ok && result.attempts).toBe(2)
    const second = model.asked[1]!
    const wrong = translationComplaint(TRANSLATION_COMPLAINTS.wrongLocale('de', 'fr'))
    expect(second.followUp).toBe(wrong)
    expect(second.user.endsWith(`\n\n${wrong}`)).toBe(true)
    expect(second.user.startsWith(model.asked[0]!.user)).toBe(true)
  })

  test('asks again for an answer that is not JSON, or not a catalogue file', async () => {
    // Prevents prose, or a file whose messages lack a field, reaching the import, which
    // would read an entry with no id as one the form does not have and one with no source
    // as stale. Each is asked for again, with what was wrong with it.
    const model = scripted(
      'Bien sûr ! Voici la traduction.',
      JSON.stringify({ locale: 'fr', messages: [{ id: 'email', target: 'Courriel' }] }),
      answerWith(FRENCH),
    )

    const result = await translateCatalogue(model.ask, order, 'fr')

    expect(result.ok && result.attempts).toBe(3)
    expect(model.asked[1]!.followUp).toBe(translationComplaint(TRANSLATION_COMPLAINTS.notJson))
    expect(model.asked[2]!.followUp).toBe(
      translationComplaint(TRANSLATION_COMPLAINTS.notACatalogue(TRANSLATION_COMPLAINTS.badMessage(0))),
    )
  })

  test('says which half of the file was missing, when it was not a catalogue file at all', async () => {
    // A model told "that was not the catalogue file" and nothing more rewrites the part
    // that was right. The complaint names what the file lacked.
    const model = scripted(
      JSON.stringify({ messages: [] }),
      JSON.stringify({ locale: 'fr', translations: {} }),
      answerWith(FRENCH),
    )

    await translateCatalogue(model.ask, order, 'fr')

    expect(model.asked[1]!.followUp).toBe(
      translationComplaint(TRANSLATION_COMPLAINTS.notACatalogue(TRANSLATION_COMPLAINTS.noLocale)),
    )
    expect(model.asked[2]!.followUp).toBe(
      translationComplaint(TRANSLATION_COMPLAINTS.notACatalogue(TRANSLATION_COMPLAINTS.noMessages)),
    )
  })

  test('keeps a partial answer, and says which messages are still missing', async () => {
    // A model unsure of a message is told to leave it empty. Refusing the answer for
    // that would ask it to guess, which is the one thing it was told not to do.
    const model = scripted(answerWith({ email: 'Courriel' }))

    const result = await translateCatalogue(model.ask, order, 'fr')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attempts).toBe(1)
    expect(result.answer.stillMissing).toEqual(['country.de', 'canton', 'section.where'])
  })

  test('drops and lists an id it was not asked for', async () => {
    // Prevents a model rewriting a translation a person made: "Pays" is French nobody
    // asked to have redone, and an orphan is not part of the form. An id carried back
    // with an empty target wrote nothing, so nothing of it was dropped: listed, it made
    // a model that translated nothing read as one whose translations were thrown away.
    const model = scripted(
      answerWith(FRENCH, [
        { id: 'country', source: 'Country', target: 'Contrée' },
        { id: 'gone', source: 'A question nobody asks any more', target: 'Autre chose' },
        { id: 'country.ch', source: 'Switzerland', target: '' },
      ]),
    )

    const result = await translateCatalogue(model.ask, order, 'fr')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.answer.dropped).toEqual(['country', 'gone'])
    expect(result.answer.messages.map((message) => message.id)).toEqual(Object.keys(FRENCH))
  })

  test('ends on a decline, after that one turn', async () => {
    // As for a form (0158): another turn is a round trip by hand to hear the same answer.
    const model = scripted(declinedAnswer('I cannot write Romansh well enough for a form.'))

    const result = await translateCatalogue(model.ask, order, 'rm')

    expect(result).toMatchObject({ ok: false, ended: 'declined', attempts: 1 })
    expect(model.asked).toHaveLength(1)
  })

  test('asks for the reason when a decline has none, rather than checking it as a catalogue', async () => {
    // Prevents a decline with no reason being answered with "it has no locale", which sets
    // a model writing the catalogue it has just said it cannot. It is asked for the reason.
    const model = scripted(JSON.stringify({ [DECLINE_KEY]: '' }), answerWith(FRENCH))

    await translateCatalogue(model.ask, order, 'fr')

    expect(model.asked[1]!.followUp).toBe(translationComplaint(TRANSLATION_COMPLAINTS.unexplainedDecline))
  })

  test('asks nothing when nothing is missing', async () => {
    // A turn paid for, through a relay two pastes by hand, to translate nothing.
    const model = scripted(answerWith(FRENCH))

    const result = await translateCatalogue(model.ask, order, 'en')

    expect(result).toMatchObject({ ok: true, attempts: 0 })
    expect(model.asked).toEqual([])
  })

  test('stops when the person stops it', async () => {
    // Prevents a Stop that waits on a model which may never answer: the run ends at once,
    // as a form's does (0157), and nothing that comes later is kept.
    const stop = createStop()
    const ask = (): Promise<string> => {
      stop.stop()
      return new Promise<string>(() => undefined)
    }

    const result = await translateCatalogue(ask, order, 'fr', { stop })

    expect(result).toMatchObject({ ok: false, ended: 'stopped' })
  })
})

describe('a proposal', () => {
  const answered = async (targets: Readonly<Record<string, string>>, extra = [] as Array<{ id: string; source: string; target: string }>) => {
    const result = await translateCatalogue(scripted(answerWith(targets, extra)).ask, order, 'fr')
    if (!result.ok) throw new Error('the scripted answer was refused')
    return result.answer
  }

  test('writes the missing messages, and only the catalogue of the language asked', async () => {
    const session = createBuilderSession(order)

    const proposal = proposeTranslation(session, await answered(FRENCH))

    expect(proposal.locale).toBe('fr')
    expect(proposal.rows.map(({ id, was, now }) => ({ id, was, now }))).toEqual(
      Object.entries(FRENCH).map(([id, now]) => ({ id, was: '', now })),
    )
    // One change, and it is the French: nothing about the form but how it reads in French.
    expect(proposal.changes.map((change) => change.path)).toEqual(['i18n.messages.fr'])
    expect(proposal.costsAnswers).toBe(false)
    expect(proposal.stillMissing).toEqual([])
    // Proposed, not applied.
    expect(session.revision()).toBe(0)
  })

  test('keeps a target that is the same as its source, and marks it', async () => {
    // The starter maps canton to "Canton" in French, and it is right; a target equal to
    // its source is also what a message nobody translated looks like. So it is kept,
    // and marked for the person reading the review.
    const proposal = proposeTranslation(createBuilderSession(order), await answered(FRENCH))

    expect(proposal.rows.find((row) => row.id === 'canton')).toMatchObject({
      now: 'Canton',
      flags: ['unchanged'],
    })
    expect(proposal.rows.find((row) => row.id === 'email')?.flags).toEqual([])
  })

  test('marks a message translated from wording the form no longer has, by the import’s rule', async () => {
    // Prevents French for wording the form no longer has landing unmarked, beside the new
    // English it does not translate.
    const answer = await answered(FRENCH)
    const session = createBuilderSession(order)
    // The English changed while the model was answering.
    session.setMessage('en', 'email', 'Email address')

    const proposal = proposeTranslation(session, answer)

    expect(proposal.rows.find((row) => row.id === 'email')).toMatchObject({
      source: 'Email address',
      now: 'Courriel',
      flags: ['stale'],
    })
  })

  test('marks a message stale by the source it was asked with, never by the one the model wrote back', async () => {
    // The mark answers "has the English moved since the model was asked?", and only the
    // request knows what it asked. Read off the model's echo, the mark went on every row of
    // a model that translated the sources as well as the targets, with nothing moved.
    const rows = translationPrompt(order, 'fr').rows
    const rewritten = JSON.stringify({
      locale: 'fr',
      defaultLocale: 'en',
      messages: rows.map(({ id }) => ({ id, source: FRENCH[id], target: FRENCH[id] })),
    })
    const result = await translateCatalogue(scripted(rewritten).ask, order, 'fr')
    if (!result.ok) throw new Error('the scripted answer was refused')

    const proposal = proposeTranslation(createBuilderSession(order), result.answer)

    expect(proposal.rows.map((row) => row.id)).toEqual(Object.keys(FRENCH))
    expect(proposal.rows.filter((row) => row.flags.includes('stale')).map((row) => row.id)).toEqual([])
  })

  test('and marks one whose English changed while the model answered, whatever source it wrote back', async () => {
    // D15's own example: the English became a negation while the turn waited, and a model
    // that left the source out wrote French for the old wording. Read off the echo, the row
    // carried no mark and Apply took it, since the form had not moved after the answer came.
    const session = createBuilderSession(order)
    const ask = (): Promise<string> => {
      session.setMessage('en', 'email', 'Do not email me')
      return Promise.resolve(
        JSON.stringify({
          locale: 'fr',
          defaultLocale: 'en',
          messages: [{ id: 'email', source: '', target: 'Courriel' }],
        }),
      )
    }
    const result = await translateCatalogue(ask, session.document(), 'fr')
    if (!result.ok) throw new Error('the answer was refused')

    const proposal = proposeTranslation(session, result.answer)

    expect(proposal.rows).toEqual([
      { id: 'email', source: 'Do not email me', was: '', now: 'Courriel', flags: ['stale'] },
    ])
  })

  test('takes a target of nothing but spaces as one left empty, and writes nothing for it', async () => {
    // Prevents a French label of " ": the import writes any target but "", and a form
    // reads any target its language has before the default's, so a blank one hid the
    // English fallback, counted as translated, and left the language reported complete.
    const result = await translateCatalogue(
      scripted(answerWith({ ...FRENCH, canton: '\n\t', email: ' ' })).ask,
      order,
      'fr',
    )
    if (!result.ok) throw new Error('the scripted answer was refused')
    expect(result.answer.stillMissing).toEqual(['canton', 'email'])

    const proposal = proposeTranslation(createBuilderSession(order), result.answer)

    expect(proposal.rows.map((row) => row.id)).toEqual(['country.de', 'section.where'])
    expect(Object.keys(proposal.document.i18n?.messages['fr'] ?? {})).not.toContain('email')
    expect(proposal.stillMissing).toEqual(['canton', 'email'])
  })

  test('never writes an id it was not asked for', async () => {
    // The filter at the second layer: an answer made by hand, carrying "Pays" redone.
    // The import alone would write it — it is a live message — so this is the line that
    // keeps a person's translation.
    const answer: TranslationAnswer = {
      ...(await answered(FRENCH)),
      messages: [
        ...(await answered(FRENCH)).messages,
        { id: 'country', source: 'Country', target: 'Contrée' },
      ],
    }
    const session = createBuilderSession(order)

    const proposal = proposeTranslation(session, answer)
    applyProposal(session, proposal)

    expect(session.document().i18n?.messages['fr']?.['country']).toBe('Pays')
    expect(proposal.dropped).toContain('country')
  })

  test('never overwrites a message a person translated while the model was answering', async () => {
    // Prevents a model's answer replacing French a person typed while it answered: missing
    // when the model was asked and not when the answer lands, it is dropped and listed.
    const answer = await answered(FRENCH)
    const session = createBuilderSession(order)
    session.setMessage('fr', 'email', 'Adresse électronique')

    const proposal = proposeTranslation(session, answer)
    applyProposal(session, proposal)

    expect(session.document().i18n?.messages['fr']?.['email']).toBe('Adresse électronique')
    expect(proposal.dropped).toEqual(['email'])
  })

  test('is refused once the form has moved, and otherwise applies as one undo step', async () => {
    // Prevents a proposal made against one form landing on another — here a person
    // translated the canton after it was made — and an Apply that takes more than one undo
    // to take back.
    const answer = await answered(FRENCH)
    const moved = createBuilderSession(order)
    const stale = proposeTranslation(moved, answer)
    moved.setMessage('fr', 'canton', 'Canton')

    const refused = applyProposal(moved, stale)
    expect(refused).toMatchObject({ ok: false, message: moved.text('proposal.stale') })

    const session = createBuilderSession(order)
    const before = session.document()
    expect(applyProposal(session, proposeTranslation(session, answer)).ok).toBe(true)
    expect(session.document().i18n?.messages['fr']).toMatchObject(FRENCH)
    session.undo()
    expect(session.document()).toEqual(before)
  })

  test('continues an earlier one with the rest, and keeps that one’s basis', async () => {
    // "Translate the rest": the second answer is written over the first proposal, and the
    // two land together — or not at all, if the form has moved since the first.
    const session = createBuilderSession(order)
    const first = proposeTranslation(session, await answered({ email: 'Courriel' }))
    expect(first.stillMissing).toEqual(['country.de', 'canton', 'section.where'])

    const rest = translationPrompt(first.document, 'fr')
    expect(rest.rows.map((row) => row.id)).toEqual(first.stillMissing)
    const more = await translateCatalogue(
      scripted(answerWith({ 'country.de': 'Allemagne', canton: 'Canton', 'section.where': 'Livraison' })).ask,
      first.document,
      'fr',
    )
    if (!more.ok) throw new Error('the scripted answer was refused')
    const both = proposeTranslation(session, more.answer, first)

    expect(both.basedOn).toBe(first.basedOn)
    expect(both.rows.map((row) => row.id)).toEqual(['email', 'country.de', 'canton', 'section.where'])
    expect(both.stillMissing).toEqual([])
    expect(applyProposal(session, both).ok).toBe(true)
    expect(missingMessages(session.document(), 'fr')).toEqual([])
    session.undo()
    expect(session.document()).toEqual(order)
  })

  test('and the rest is refused with the first when the form moved in between', async () => {
    // Prevents the rest being held against the form as it is now: its document is the
    // first proposal's, written over the form as it was then, so applying it would put
    // back whatever changed in between — here, a person's French for the canton.
    const session = createBuilderSession(order)
    const first = proposeTranslation(session, await answered({ email: 'Courriel' }))
    session.setMessage('fr', 'canton', 'Canton suisse')
    const more = await translateCatalogue(
      scripted(answerWith({ 'country.de': 'Allemagne', 'section.where': 'Livraison' })).ask,
      first.document,
      'fr',
    )
    if (!more.ok) throw new Error('the scripted answer was refused')

    const outcome = applyProposal(session, proposeTranslation(session, more.answer, first))

    expect(outcome).toMatchObject({ ok: false, message: session.text('proposal.stale') })
    expect(session.document().i18n?.messages['fr']?.['canton']).toBe('Canton suisse')
  })
})

describe('what a pane says', () => {
  const text = createBuilderText()

  test('names the language, and says when something in it is marked', async () => {
    // Prevents a review whose name hides that something in it needs looking at: the heading
    // names the region, so a screen reader hears that before the first row.
    const result = await translateCatalogue(scripted(answerWith(FRENCH)).ask, order, 'fr')
    if (!result.ok) throw new Error('refused')
    const proposal = proposeTranslation(createBuilderSession(order), result.answer)

    expect(translationHeading(proposal, text)).toBe(text('translate.review.marked', { locale: 'fr' }))
    expect(translationHeading({ ...proposal, rows: [] }, text)).toBe(text('translate.review', { locale: 'fr' }))
  })

  test('says what is ready and what is still missing, in the session’s language', async () => {
    // Prevents a status that says what is ready and not what the model left out, or says
    // it in English to a session opened in German.
    const result = await translateCatalogue(scripted(answerWith({ email: 'Courriel' })).ask, order, 'fr')
    if (!result.ok) throw new Error('refused')
    const proposal = proposeTranslation(createBuilderSession(order), result.answer)
    const state = { busy: false, result, proposal, refusal: undefined }
    const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })

    expect(translationStatus(state, text)).toBe(
      `${text('translate.status.ready', { count: 1 })} ${text('translate.status.stillMissing', { count: 3 })}`,
    )
    expect(translationStatus(state, german)).toBe(
      `${german('translate.status.ready', { count: 1 })} ${german('translate.status.stillMissing', { count: 3 })}`,
    )
  })

  test('says each way a run ends without an answer as that, and never as a document that failed', () => {
    // The form's sentences say "the document still did not work"; a translation that
    // was never a catalogue is not a document, and an unreachable model or a decline is
    // not an answer that failed (0157, 0158).
    const ended = (how: 'gave-up' | 'unreachable' | 'declined', reason?: string) => ({
      busy: false,
      result: { ok: false as const, attempts: 3, problems: [], lastAnswer: '', ended: how, ...(reason === undefined ? {} : { reason }) },
      proposal: undefined,
      refusal: undefined,
    })

    expect(translationStatus(ended('gave-up'), text)).toBe(text('translate.status.failed', { count: 3 }))
    expect(translationStatus(ended('unreachable', 'offline'), text)).toBe(
      text('prompt.status.unreachable', { reason: 'offline' }),
    )
    expect(translationStatus(ended('unreachable'), text)).toBe(text('prompt.status.unreachableNoReason'))
    expect(translationStatus(ended('declined', 'no Romansh'), text)).toBe(text('prompt.status.declined'))
  })

  test('a model answering another request is said to be busy, in each language, over an earlier proposal too', async () => {
    // A host's relay carries one turn at a time, and the prompt pane, the scenario pane and
    // this pane may all ask it (0160, 0162). A translation refused as busy said nothing:
    // no case for it, so the status was empty — or, after *Translate the rest*, it was the
    // first answer's "ready to review", as though the second had been asked at all. The
    // sentence is the prompt pane's, because nothing was applied in either.
    const result = await translateCatalogue(scripted(answerWith({ email: 'Courriel' })).ask, order, 'fr')
    if (!result.ok) throw new Error('refused')
    const earlier = proposeTranslation(createBuilderSession(order), result.answer)
    const busy = {
      busy: false,
      result: { ok: false as const, attempts: 1, problems: [], lastAnswer: '', ended: 'busy' as const },
      proposal: undefined,
      refusal: undefined,
    }
    const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
    const french = createBuilderText({ locale: 'fr', messages: BUILDER_MESSAGES_FR })

    expect(translationStatus(busy, text)).toBe(text('prompt.status.busy'))
    expect(translationStatus(busy, text)).not.toMatch(/reached/)
    expect(translationStatus(busy, german)).toBe(german('prompt.status.busy'))
    expect(translationStatus(busy, french)).toBe(french('prompt.status.busy'))
    expect(translationStatus({ ...busy, proposal: earlier }, text)).toBe(text('prompt.status.busy'))
  })

  test('says when the model translated nothing, and when it took more than one go', async () => {
    // Nothing to review is not "ready to review: 0 translations"; and a model that needed
    // correcting is one to read more carefully, as for a form.
    const none = await translateCatalogue(scripted(answerWith({})).ask, order, 'fr')
    if (!none.ok) throw new Error('refused')
    const empty = proposeTranslation(createBuilderSession(order), none.answer)
    expect(translationStatus({ busy: false, result: none, proposal: empty, refusal: undefined }, text)).toBe(
      `${text('translate.status.none')} ${text('translate.status.stillMissing', { count: 4 })}`,
    )

    const twice = await translateCatalogue(scripted('no', answerWith(FRENCH)).ask, order, 'fr')
    if (!twice.ok) throw new Error('refused')
    const ready = proposeTranslation(createBuilderSession(order), twice.answer)
    expect(translationStatus({ busy: false, result: twice, proposal: ready, refusal: undefined }, text)).toBe(
      text('translate.status.readyAfter', { count: 4, attempts: 2 }),
    )
  })

  test('says a model whose every translation was dropped did that, not that it translated nothing', async () => {
    // A model that translated every message, each translated by a person while it answered:
    // "the model left every message untranslated" was false, and with no review drawn for a
    // proposal of no rows, it was the only thing on screen.
    const result = await translateCatalogue(scripted(answerWith(FRENCH)).ask, order, 'fr')
    if (!result.ok) throw new Error('refused')
    const session = createBuilderSession(order)
    for (const [id, target] of Object.entries(FRENCH)) session.setMessage('fr', id, `${target} (à la main)`)

    const proposal = proposeTranslation(session, result.answer)

    expect(proposal.rows).toEqual([])
    expect(proposal.dropped).toEqual(Object.keys(FRENCH))
    expect(translationStatus({ busy: false, result, proposal, refusal: undefined }, text)).toBe(
      text('translate.status.noneWritten', { count: 4 }),
    )
  })

  test('and says a model that wrote nothing translated nothing, though a person translated one meanwhile', async () => {
    // The other side of that sentence: an empty target is not a translation dropped.
    // Counted as one, a model that left every message empty was said to have translated.
    const result = await translateCatalogue(scripted(answerWith({})).ask, order, 'fr')
    if (!result.ok) throw new Error('refused')
    const session = createBuilderSession(order)
    session.setMessage('fr', 'email', 'Courriel')

    const proposal = proposeTranslation(session, result.answer)

    expect(proposal.dropped).toEqual([])
    expect(translationStatus({ busy: false, result, proposal, refusal: undefined }, text)).toBe(
      `${text('translate.status.none')} ${text('translate.status.stillMissing', { count: 3 })}`,
    )
  })

  test('holds for review only a proposal that writes something', async () => {
    // A proposal of no rows has nothing to apply and nothing to discard. Held for review,
    // both builders drew neither the review nor Ask, and left a sentence and no button,
    // with nothing but another language or tab to get out.
    const none = await translateCatalogue(scripted(answerWith({})).ask, order, 'fr')
    const some = await translateCatalogue(scripted(answerWith({ email: 'Courriel' })).ask, order, 'fr')
    if (!none.ok || !some.ok) throw new Error('refused')
    const session = createBuilderSession(order)
    const writing = proposeTranslation(session, some.answer)

    expect(translationToReview(proposeTranslation(session, none.answer))).toBeUndefined()
    expect(translationToReview(writing)).toBe(writing)
    expect(translationToReview(undefined)).toBeUndefined()
  })

  test('says a later run stopped, over the proposal an earlier one left', async () => {
    // "Translate the rest", stopped: the first answer is still there to review, and the
    // sentence is about the button just pressed.
    const result = await translateCatalogue(scripted(answerWith({ email: 'Courriel' })).ask, order, 'fr')
    if (!result.ok) throw new Error('refused')
    const proposal = proposeTranslation(createBuilderSession(order), result.answer)
    const stopped = { ok: false as const, attempts: 1, problems: [], lastAnswer: '', ended: 'stopped' as const }

    expect(translationStatus({ busy: false, result: stopped, proposal, refusal: undefined }, text)).toBe(
      text('prompt.status.stopped'),
    )
    expect(translationStatus({ busy: true, result: undefined, proposal, refusal: undefined }, text)).toBe(
      text('translate.status.asking'),
    )
  })
})
