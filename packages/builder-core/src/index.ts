export { authorForm } from './authoring.js'
export type {
  AskModel,
  AuthoringOptions,
  AuthoringPrompt,
  AuthoringProblem,
  AuthoringResult,
} from './authoring.js'
export { createBuilderSession, dataPathOf } from './session.js'
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
export { OPERATORS, celLiteral, compileCondition, compileGroup } from './conditions.js'
export type { Condition, ConditionGroup, Operator } from './conditions.js'
export { dropLocation } from './drop.js'
export { layoutDropLocation } from './layout-drop.js'
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
export { builderView } from './view.js'
export type { BuilderView, MoveTarget } from './view.js'
export {
  RULE_KIND_CHOICES,
  composeRule,
  conditionOf,
  draftIsComplete,
  emptyRow,
  kindCarriesCondition,
  kindWrites,
  rowTakesValue,
  ruleKindsFor,
  ruleTargetFor,
} from './logic.js'
export type { ConditionRow, RuleKindChoice } from './logic.js'
