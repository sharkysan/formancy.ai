export { authorForm, createStop, declinedAnswer, ModelBusyError } from './authoring.js'
export { applyProposal, proposalHeading, proposalStatus, proposeEdit } from './proposal.js'
// A model whose turn a person carries: the request copied out, the answer pasted back (0160).
export { createRelay, relayMessage } from './relay.js'
export type { Relay, RelayAnswer, RelayChat, RelayTurn } from './relay.js'
export type { EditProposal, ProposalExamples } from './proposal.js'
// A prompt pane's run, held where the host chooses, so a turn outlives the pane that asked (0163).
export { createPromptRun } from './prompt-run.js'
export type { PromptRun, PromptRunOptions, PromptRunState } from './prompt-run.js'
// A translation's run, held for its language, and a drafting part's, held for its form, so
// those turns outlive their parts too (0164).
export { createTranslationRun, translationOn } from './translation-run.js'
export type {
  TranslationElsewhere,
  TranslationRun,
  TranslationRunOptions,
  TranslationRunState,
  TranslationView,
} from './translation-run.js'
export { createDraftRun, draftsOn } from './draft-run.js'
export type { DraftRun, DraftRunOptions, DraftRunState } from './draft-run.js'
// A model asked for the messages a language is missing, and its answer reviewed message by
// message before it lands (0161).
export {
  missingMessages,
  proposeTranslation,
  translateCatalogue,
  translationHeading,
  translationStatus,
  translationToReview,
} from './translate.js'
export type {
  TranslationAnswer,
  TranslationFlag,
  TranslationOptions,
  TranslationProblem,
  TranslationProposal,
  TranslationResult,
  TranslationRowChange,
} from './translate.js'
export { translationPrompt } from './translate-prompt.js'
export type { TranslationRequest, TranslationRow } from './translate-prompt.js'
export { comparedToLastRun, createRunHistory, scenarioStatus } from './scenario-runs.js'
export type { RunHistory, ScenarioRunChange } from './scenario-runs.js'
// Examples drafted from what the author said, judged by the engine, kept one at a time (0162).
export {
  draftExpectations,
  draftProblems,
  draftQuotes,
  draftScenarios,
  draftStatus,
  draftVerdict,
  keepDraft,
} from './scenario-drafts.js'
export type {
  DraftNote,
  DraftProblem,
  DraftQuotes,
  DraftState,
  Drafted,
  DraftingOptions,
  KeptDraft,
  UnusableDraft,
  UnusableReason,
} from './scenario-drafts.js'
// What an example is, read from JSON somebody else wrote: a model's answer, or a stored row (0166).
export { readScenario } from './scenario-shape.js'
export type { ReadScenario, ScenarioShapeProblem, ScenarioShapeReason } from './scenario-shape.js'
export { scenarioPrompt } from './scenario-prompt.js'
export type { ScenarioPrompt, ScenarioPromptOptions } from './scenario-prompt.js'
// The requests formancy makes of a model, by name, so a server holding the key can write
// the briefing itself rather than take one from the browser (0165).
export { MODEL_REQUEST_KINDS, isModelRequestKind, modelBriefing, modelRequestKind } from './model-requests.js'
export type { ModelRequestKind } from './model-requests.js'
export type {
  AskModel,
  AskTurn,
  AuthoringOptions,
  AuthoringPrompt,
  AuthoringProblem,
  AuthoringResult,
  Stop,
} from './authoring.js'
// The builder’s own words, in the language of the person building (0114). A
// session carries one; the functions that name things take one and default to
// English, so a caller that never asks for a language gets the words it always had.
export { BUILDER_MESSAGES, createBuilderText } from './messages.js'
export { BUILDER_MESSAGES_DE } from './messages-de.js'
export { BUILDER_MESSAGES_FR } from './messages-fr.js'
export { SCHEMA_WORDS_DE } from './schema-words-de.js'
export { SCHEMA_WORDS_FR } from './schema-words-fr.js'
export { SCHEMA_ERRORS_DE } from './schema-errors-de.js'
export { SCHEMA_ERRORS_FR } from './schema-errors-fr.js'
export { schemaTexts } from './schema-words.js'
export { pseudoLanguage, untranslated } from './pseudo.js'
export type {
  BuilderCatalogue,
  BuilderLanguage,
  BuilderMessageId,
  BuilderText,
  Message,
  PluralMessage,
  SchemaErrorSentences,
  SchemaErrorWords,
  SchemaWords,
} from './messages.js'
export { createBuilderSession } from './session.js'
export { dataPathOf } from './navigate.js'
export type {
  BuilderSession,
  CatalogueFile,
  CommandOutcome,
  ImportReport,
  Location,
  Refusal,
} from './session.js'
export {
  LAYOUT_CONTAINER_KINDS,
  childrenAt as layoutChildrenAt,
  containerPaths as layoutContainerPaths,
  describeNode as describeLayoutNode,
  encloses as layoutEncloses,
  isLayoutContainer,
  nodeAt as layoutNodeAt,
  nodesOfLayout,
} from './layout.js'
export type { LayoutAddress, LayoutContainerKind, LayoutLocation } from './layout.js'

// --------------------------------------------- what a builder's UI needs, once
//
// Seven modules that mention no framework, and lived in `@formancy/builder-react`
// only because it was the only builder there was. A second one makes that
// expensive: an Angular builder would either import from the React package —
// dragging React into an Angular application's dependency closure — or copy
// them, which is two implementations of the compiler that turns a condition into
// CEL and two answers to where a drop lands.
//
// They belong here for the same reason `@formancy/core` exists: the hard part is
// framework-free, and a binding should be the part that is not.
export {
  OPERATORS,
  answerKindOf,
  celLiteral,
  compileCondition,
  compileGroup,
  isGroup,
  operatorTakesValue,
  operatorsFor,
} from './conditions.js'
export type { AnswerKind, Condition, ConditionGroup, Operator } from './conditions.js'
export {
  addGroup,
  addRow,
  conditionFields,
  conditionOf,
  emptyDraft,
  emptyRow,
  groupOf,
  isRowGroup,
  removeFromDraft,
  rowsOf,
  setJoin,
  updateRow,
} from './condition-draft.js'
export type {
  ConditionDraft,
  ConditionField,
  ConditionRow,
  DraftPlace,
  RowGroup,
} from './condition-draft.js'
export { dropLocation } from './drop.js'
export { layoutDropLocation } from './layout-drop.js'
export { SIDE_ZONE_MINIMUM, arrangeDrop, gapNeighbour } from './arrange.js'
export type { ArrangeDrop, Box, DrawnNode } from './arrange.js'
export { describeLayoutTarget, flattenLayout, nameOfPath } from './layout-tree.js'
export type { LayoutTreeNode } from './layout-tree.js'
export { newFieldOfType, nextSpecVersion, paletteEntries, typesNeedingUpgrade } from './palette.js'
export type { PaletteEntry } from './palette.js'
export {
  editableLayoutPropertiesFor,
  editablePropertiesFor,
  layoutKinds,
} from './properties.js'
export type { EditableProperty, PropertyKind } from './properties.js'
export { describeTarget, flatten, nameOf } from './tree.js'
export type { TreeNode } from './tree.js'
// What a builder says after a command on the structure tree, decided once for both.
export {
  addPageAndSay,
  dropAndSay,
  insertAndSay,
  moveAndSay,
  redoAndSay,
  removeAndSay,
  treeKeyHelp,
  undoAndSay,
  unwrapAndSay,
  upgradeAndSay,
} from './spoken.js'
// What the arrangement pane offers and says, decided once for both builders.
export {
  LAYOUT_CONTAINERS,
  addLayoutAndSay,
  arrangeDropAndSay,
  codeAnswers,
  dropLayoutAndSay,
  insertLayoutAndSay,
  layoutAdditions,
  layoutKeyHelp,
  layoutNodeFor,
  moveLayoutAndSay,
  nameOfAddition,
  removeLayoutAndSay,
  unwrapLayoutAndSay,
  wrapAndSay,
  wrapCandidates,
} from './arrangement.js'
export type { LayoutAddition } from './arrangement.js'
export { LIST_WORDS, layoutPropertyHeading, nextChoice, withPicture } from './editors.js'
export { builderView } from './view.js'
export type { BuilderView, MoveTarget } from './view.js'
export {
  RULE_KIND_CHOICES,
  comparisonLabel,
  composeRule,
  draftIsComplete,
  operatorLabel,
  ruleKindHint,
  ruleKindLabel,
  kindCarriesCondition,
  kindWrites,
  ruleKindsFor,
  referencedMessages,
  ruleTargetFor,
} from './logic.js'
export type { RuleKindChoice } from './logic.js'
export { describeCondition, explainRows, explainRule, rulesOverview } from './rules-overview.js'
export type { RowVerdict, RuleSummary, RuleVerdict, RulesOn } from './rules-overview.js'
// The clock an explanation is given, as the engine takes it: the host's, never ambient.
export { captureCapabilities, fixedCapabilities } from '@formancy/expressions'
export type { Capabilities } from '@formancy/expressions'
export {
  blockFrom,
  blockTargets,
  insertBlock,
  insertBlockAndSay,
  saveBlockAndSay,
  withBlock,
} from './blocks.js'
export type { BlockPlaced, BlockSaved, BuilderBlock } from './blocks.js'
