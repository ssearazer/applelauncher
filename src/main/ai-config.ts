/*
 * Built-in credentials for the AI assistant: the player is never asked for a key.
 * OPENROUTER_API_KEY in the environment overrides the built-in one (useful for development).
 *
 * Anything shipped inside an installed app can be extracted from it, and a free key has one shared daily quota
 * for every player. Restrict / rotate the key in the provider dashboard, or route requests through your own proxy
 * if the launcher is distributed widely.
 */
export const AI_API_KEY = process.env.OPENROUTER_API_KEY?.trim() || ''

/**
 * Free models, strongest first; the next one is used when a model is rate-limited, retired or answers badly.
 * Free model ids on OpenRouter come and go: re-run test-openrouter.mjs from time to time and refresh this list.
 */
export const AI_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'baidu/ernie-5.5-flash-preview:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'particle-ai/particle-1:free'
]
