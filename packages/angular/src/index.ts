export { FORMANCY_ENGINE, FORMANCY_TEXT, injectEngine, provideFormancy } from './provide.js'
export type { FormancyOptions } from './provide.js'
// The form's own words (0171): the catalogue is `@formancy/core/words`; a host passes its
// languages to `provideFormancy`, and a registry's own controls draw them with the pipe.
export { FormancyTextPipe, injectFormText } from './text.js'
export type { FormText, FormWordId, FormWords, FormWordsByLocale } from '@formancy/core/words'
export { injectField } from './field.js'
export type { FieldBinding } from './field.js'
export { injectRepeater } from './repeater.js'
export type { RepeaterBinding } from './repeater.js'
export { injectWizard } from './wizard.js'
export type { WizardBinding } from './wizard.js'
export { injectSubmit } from './submit.js'
export {
  FORMANCY_FIELD_CONTEXT,
  FORMANCY_REGISTRY,
  injectFieldContext,
  provideFormancyRegistry,
} from './registry.js'
export type { FormancyFieldContext, FormancyRegistry } from './registry.js'
export {
  DEFAULT_FIELD_COMPONENTS,
  FormancyCheckboxField,
  FormancyDateField,
  FormancyFieldShell,
  FormancyNumberField,
  FormancyRadioGroupField,
  FormancySelectField,
  FormancyTextField,
  FormancyTextareaField,
} from './fields.js'
export { FormancyComponentOutlet, FormancyFieldSlot, FormancyRepeaterSection } from './slots.js'
export { FormancyForm } from './form.js'
export { FormancyLayout } from './layout.js'
export type { SubmitOutcome } from './form.js'
export { FormancyErrorSummary } from './error-summary.js'
export { FormancyRichInline, FormancyRichText } from './rich-text.js'
export { FormancyResumeNotice } from './resume-notice.js'
export type { ResumeMigration } from './resume-notice.js'
export {
  FORMANCY_RICH_TEXT_EDITOR,
  injectRichTextEditorFactory,
  provideFormancyRichTextEditor,
} from './rich-text-editor.js'
export type {
  RichTextEditorFactory,
  RichTextEditorHandle,
  RichTextEditorMount,
} from './rich-text-editor.js'
export {
  FORMANCY_OPTIONS_SOURCES,
  injectOptionsSources,
  provideFormancyOptionsSources,
} from './options-source.js'
export type { OptionsRequest, OptionsSource, OptionsSources } from './options-source.js'
export { FORMANCY_SCANNER, injectScanner, provideFormancyScanner } from './scanning.js'
export type { ScanRequest, Scanner } from './scanning.js'
export { FORMANCY_UPLOADER, injectUploader, provideFormancyUploader } from './uploads.js'
export type { StoredFile, Uploader, UploadOptions } from './uploads.js'
