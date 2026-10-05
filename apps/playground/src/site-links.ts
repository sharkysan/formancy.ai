export const REPO = 'https://github.com/sharkysan/formancy.ai'

// The site has its own Vite server in development; production is one origin.
// Legal links must leave the playground in both cases.
export const SITE = import.meta.env.DEV ? 'http://localhost:4384/' : '/'
