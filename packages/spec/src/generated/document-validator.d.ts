import type { ValidateFunction } from 'ajv/dist/2020.js'
import type { FormSchema } from '../types.js'

declare const validate: ValidateFunction<FormSchema>
export default validate
