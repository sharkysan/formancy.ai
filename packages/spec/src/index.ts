export { canonicalize } from './canonical.js'
export { authoringBriefing, authoringFacts } from './authoring.js'
export type { AuthoringFacts } from './authoring.js'
export { schemaHash } from './hash.js'
export { diffSchemas } from './diff.js'
export {
  CONTAINER_FIELD_TYPES,
  CURRENT_SPEC_VERSION,
  FIELD_TYPES,
  LIST_VALUED_FIELD_TYPES,
  SPEC_1_FIELD_TYPES,
  SPEC_1_LAYOUT_KINDS,
  SPEC_VERSIONS,
} from './types.js'
export { upgradeSpecVersion } from './upgrade.js'
export { isSafeHref, parseRichText, richTextToPlain } from './richtext.js'
export type { RichBlock, RichInline } from './richtext.js'
export type {
  Change,
  ContainerFieldType,
  ChangeSeverity,
  FieldDef,
  FieldFormat,
  FieldOption,
  FieldType,
  FormLogic,
  FormI18n,
  FormLayout,
  FormModel,
  FormSchema,
  LayoutNode,
  ListValuedFieldType,
  SpecVersion,
  MessageRef,
  RunsOn,
  Text,
  LogicRule,
  RuleKind,
} from './types.js'
export { modelDataPaths } from './paths.js'
export { ROW_ID, ROW_ID_PREFIX } from './types.js'
export { collectFieldPaths, isMessageRef, modelPathsForLayout, resolveText, unreferencedPaths } from './presentation.js'
