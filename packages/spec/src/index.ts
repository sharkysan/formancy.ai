export { canonicalize } from './canonical.js'
export { schemaHash } from './hash.js'
export { diffSchemas } from './diff.js'
export { CONTAINER_FIELD_TYPES, FIELD_TYPES } from './types.js'
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
  MessageRef,
  Text,
  LogicRule,
  RuleKind,
} from './types.js'
export { modelDataPaths } from './paths.js'
export { collectFieldPaths, isMessageRef, modelPathsForLayout, resolveText, unreferencedPaths } from './presentation.js'
