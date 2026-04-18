/**
 * Label grammar — composes cursor labels from structured narration context.
 *
 * Replaces the closed `PresenceLabelKey` enum in agent-presence.ts. Takes
 * (verb, target, mood, sessionId) and produces the text shown under the
 * cursor. Synonym rotation is deterministic per session so the same session
 * always uses the same phrase for the same verb.
 *
 * Unknown verbs fall back to "Running {verb}" so new CLI verbs degrade
 * gracefully without a code change here.
 */

import type { Mood, NarrationTarget } from './narration-event'

interface VerbEntry {
  /** 1..N synonyms; picked deterministically per session. */
  phrases: string[]
  /** Optional preposition when a target name is present. */
  preposition?: string
  /** When mood requires override (error → "Retrying X"). */
  errorPhrase?: string
}

const VERB_GRAMMAR: Record<string, VerbEntry> = {
  click: { phrases: ['Clicking', 'Pressing', 'Selecting'], errorPhrase: 'Retrying click' },
  fill: { phrases: ['Typing'], preposition: 'into', errorPhrase: 'Retrying type' },
  type: { phrases: ['Typing'], preposition: 'into' },
  select: { phrases: ['Choosing', 'Picking'], errorPhrase: 'Retrying select' },
  hover: { phrases: ['Hovering'], preposition: 'over' },
  press: { phrases: ['Pressing'] },
  submit: { phrases: ['Submitting'] },

  snapshot: { phrases: ['Reading the page', 'Scanning the page'] },
  'query-elements': { phrases: ['Searching', 'Looking for'] },
  get: { phrases: ['Reading'] },
  console: { phrases: ['Reading console'] },
  errors: { phrases: ['Reading errors'] },

  scroll: { phrases: ['Scrolling'] },
  scrollintoview: { phrases: ['Scrolling'], preposition: 'to' },
  screenshot: { phrases: ['Capturing'] },
  wait: { phrases: ['Waiting'], preposition: 'for' },
  navigate: { phrases: ['Navigating'], preposition: 'to' },
  back: { phrases: ['Going back'] },
  forward: { phrases: ['Going forward'] },
  reload: { phrases: ['Reloading'] },

  workspace: { phrases: ['Scanning workspace', 'Surveying canvas'] },
  selection: { phrases: ['Reading selection'] },
  'find-placement': { phrases: ['Finding placement'] },
  create: { phrases: ['Creating', 'Adding'] },
  update: { phrases: ['Updating', 'Editing'] },
  upsert: { phrases: ['Updating'] },
  delete: { phrases: ['Removing', 'Deleting'] },
  focus: { phrases: ['Focusing on'] },
  link: { phrases: ['Linking'] },
  unlink: { phrases: ['Unlinking'] },
  group: { phrases: ['Grouping'] },
  ungroup: { phrases: ['Ungrouping'] },
  annotate: { phrases: ['Annotating'] },
  annotations: { phrases: ['Reading annotations'] },
  annotation: { phrases: ['Reading annotation'] },
  breakpoints: { phrases: ['Building breakpoint set'] },
  ack: { phrases: ['Acknowledging'] },
  resolve: { phrases: ['Resolving'] },
  dismiss: { phrases: ['Dismissing'] },
  reply: { phrases: ['Replying'] },
  record: { phrases: ['Recording'] },
}

function hashSession(sessionId: string): number {
  let h = 0
  for (let i = 0; i < sessionId.length; i++) {
    h = ((h << 5) - h + sessionId.charCodeAt(i)) | 0
  }
  return h >>> 0
}

function pickPhrase(entry: VerbEntry, sessionId: string, verb: string): string {
  if (entry.phrases.length === 1) return entry.phrases[0]
  const hash = hashSession(sessionId + ':' + verb)
  return entry.phrases[hash % entry.phrases.length]
}

function moodPrefix(mood: Mood): string | null {
  if (mood === 'stuck') return 'Waiting on'
  if (mood === 'correcting') return 'Fixing'
  return null
}

function truncateValue(value: string, max = 24): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1) + '…'
}

export function composeLabel(
  verb: string,
  target: NarrationTarget | null | undefined,
  mood: Mood,
  sessionId: string,
): string | null {
  const entry = VERB_GRAMMAR[verb]
  let phrase: string

  if (entry) {
    if (mood === 'error' && entry.errorPhrase) {
      phrase = entry.errorPhrase
    } else {
      phrase = pickPhrase(entry, sessionId, verb)
    }
  } else {
    // Unknown verb fallback — use the raw verb as an "-ing" form.
    phrase = `Running ${verb}`
  }

  // Mood prefixes stack before the phrase.
  const prefix = moodPrefix(mood)
  if (prefix && mood !== 'error') {
    phrase = `${prefix}: ${phrase.toLowerCase()}`
  }

  // Append target if present.
  if (target && (target.name || target.role || target.value)) {
    const name = target.name ?? target.role ?? null
    const value = target.value ? truncateValue(target.value) : null

    if (entry?.preposition && value && name) {
      return `${phrase} "${value}" ${entry.preposition} "${name}"`
    }
    if (entry?.preposition && name) {
      return `${phrase} ${entry.preposition} "${name}"`
    }
    if (value && name) {
      return `${phrase} "${value}" → "${name}"`
    }
    if (name) {
      return `${phrase} "${name}"`
    }
    if (value) {
      return `${phrase} "${value}"`
    }
  }

  return phrase
}
