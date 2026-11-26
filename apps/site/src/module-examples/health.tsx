import type { ReactElement, ReactNode } from 'react'
import type { Variant } from './variant.js'
import './examples.css'
import './health.css'

/**
 * Formancy Health's demo, drawn for formancy.ai (0242): its synthetic Swiss referral filled in
 * by formancy's renderer, beside the QuestionnaireResponse the packages make of the answers.
 *
 * Read from formancy.ai-health on 2026-11-25. The answers are the demo's starting ones,
 * `demoReferralAnswers` in `scripts/validator/demo-referral.mjs`, under the English labels the
 * demo's form shows (`docs/images/readme/captured.json`, its `demo-form` picture). The JSON is
 * the demo's own bytes for those answers, as the same file captures them for its
 * `demo-changed` picture with only the question's answer changed, cut with "…" and never
 * retyped from memory; the profiles are the ones `packages/health-ch/src/profiles.ts` and
 * `health-questionnaire`'s `SDC_QUESTIONNAIRE_RESPONSE` write. The refusal is the demo's
 * AHV number on purpose, in the words and the code the package states it with.
 *
 * The data is synthetic and means nothing clinically, which the caption says, with what the
 * demo itself says: the page runs no validator, and CI's validator gate judges the corpus.
 * Nothing here is a control: the radio group is drawn, and the chosen option is said in words.
 */

const SDC = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaireresponse|4.0.0'
const CH_ORF = 'http://fhir.ch/ig/ch-orf/StructureDefinition/ch-orf-questionnaireresponse|3.0.2'
const QUESTION = 'Synthetische Fragestellung, ohne klinische Bedeutung'

/** The top of the response, which both crops start with. */
const TOP = (sdc: string, chOrf: string): string =>
  ['{', '  "resourceType": "QuestionnaireResponse",', '  "meta": {', '    "profile": [', `      "${sdc}",`, `      "${chOrf}"`, '    ]', '  },'].join('\n')

const JSON_OF: Record<Variant, string> = {
  card: [TOP('…/sdc-questionnaireresponse|4.0.0', '…/ch-orf-questionnaireresponse|3.0.2'), '  …', '}'].join('\n'),
  page: [
    TOP(SDC, CH_ORF),
    '  "questionnaire": "https://forms.synthetic.invalid/Questionnaire/demo-referral|1",',
    '  "status": "completed",',
    '  …',
    '  "item": [',
    '    {',
    '      "linkId": "question",',
    '      "answer": [',
    '        {',
    `          "valueString": "${QUESTION}"`,
    '        }',
    '      ]',
    '    },',
    '    …',
    '  ]',
    '}',
  ].join('\n'),
}

/** The demo's four languages, each named in itself, so each is marked as the language it is in (WCAG 3.1.2). */
const LANGUAGES = [
  { name: 'Deutsch', lang: 'de' },
  { name: 'Français', lang: 'fr' },
  { name: 'Italiano', lang: 'it' },
  { name: 'English', lang: 'en' },
] as const

const CAPTIONS: Record<Variant, ReactNode> = {
  card:
    'Formancy Health’s demo: the first field of its synthetic Swiss referral, and the top of the QuestionnaireResponse made of the answers, claiming ' +
    'SDC’s and CH ORF’s profiles. Drawn for this page after the demo; the data is synthetic and has no clinical meaning.',
  page: (
    <>
      Formancy Health’s demo: its synthetic Swiss referral, <span lang="de">Zuweisung</span>, filled in by formancy’s renderer, and the QuestionnaireResponse
      the packages make of those answers, claiming SDC’s and CH ORF’s profiles, cut with “…”. Under it, the refusal the demo shows for an AHV number broken on
      purpose. Drawn for this page after the demo at formancy.ai/health/; the data is synthetic and has no clinical meaning. The demo runs no validator: in CI,
      the HL7 FHIR validator judges the synthetic corpus its starting answers come from.
    </>
  ),
}

export function HealthExample({ variant }: { variant: Variant }): ReactElement {
  const page = variant === 'page'

  return (
    <figure className={`mx mx-health mx-${variant}`}>
      <div className="mx-stage">
        <div className="mx-split">
          <div className="mx-form-side">
            <p className="mx-stage-label">
              <span lang="de">Zuweisung</span> · a synthetic referral
            </p>
            <div className="mx-paper mx-form">
              <dl className="mx-fields mx-fields-stacked">
                <div className="mx-field" data-long="">
                  <dt>Question for the specialist*</dt>
                  <dd lang="de">{QUESTION}</dd>
                </div>
                {page && (
                  <>
                    <div className="mx-field" data-choice="">
                      <dt>Specialty*</dt>
                      <dd>Dermatology</dd>
                    </div>
                    <div className="mx-field mx-radios">
                      <dt>The patient’s language</dt>
                      <dd>
                        <ul>
                          {LANGUAGES.map((language) => (
                            <li key={language.name} data-chosen={language.lang === 'fr' ? '' : undefined}>
                              <span lang={language.lang}>{language.name}</span>
                              {language.lang === 'fr' && <span className="visually-hidden"> (chosen)</span>}
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          </div>

          <div className="mx-json-side">
            <p className="mx-stage-label">The answers, as a QuestionnaireResponse</p>
            <pre className="mx-json">
              <code>{highlighted(JSON_OF[variant])}</code>
            </pre>
          </div>
        </div>

        {page && (
          <div className="mx-refusal">
            <p className="mx-stage-label">An AHV number whose check digit is wrong, on purpose</p>
            <p>
              <code>check-digit</code> context.patient.ahvn13: its check digit is not the one its identifier system computes from its other digits
            </p>
          </div>
        )}
      </div>
      <figcaption>{CAPTIONS[variant]}</figcaption>
    </figure>
  )
}

/**
 * The excerpt with its keys and its strings told apart, as the demo's viewer tells them apart.
 * A key is a string followed by a colon; every other string is a value. The referral's German
 * answer is marked as German, as it is in the form beside it.
 */
function highlighted(json: string): ReactNode[] {
  const parts: ReactNode[] = []
  let at = 0
  for (const match of json.matchAll(/"(?:[^"\\]|\\.)*"(\s*:)?/g)) {
    const index = match.index
    const colon = match[1]
    if (index > at) parts.push(json.slice(at, index))
    const text = colon === undefined ? match[0] : match[0].slice(0, -colon.length)
    parts.push(
      <span key={index} className={colon === undefined ? 'mx-json-string' : 'mx-json-key'} lang={text === `"${QUESTION}"` ? 'de' : undefined}>
        {text}
      </span>,
    )
    if (colon !== undefined) parts.push(colon)
    at = index + match[0].length
  }
  parts.push(json.slice(at))
  return parts
}
