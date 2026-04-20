/**
 * Cursor phrase composition — bin-based, rotating, conversational.
 *
 * Each verb maps to one of four bins (inspecting, interacting, creating,
 * waiting). Each bin carries a pool of gerund phrases; the caller picks one
 * by rotation index. For create/delete, the pool is chosen by entity kind so
 * "dropping in frame" and "jotting note" read naturally.
 *
 * A small verb-literal override map short-circuits the bin lookup when the
 * verb itself carries meaning the bin would flatten (fill → "typing",
 * navigate → "heading to").
 *
 * The output is all lowercase, no quotes, no arrows. Target names append
 * bare after the phrase; values for fill/type insert via a preposition.
 */
import type { CanvasEntityKind } from './types'

export type PhraseBin =
  | 'inspecting'
  | 'interacting'
  | 'creating'
  | 'deleting'
  | 'waiting'

const BIN_OF_VERB: Record<string, PhraseBin> = {
  // inspecting
  snapshot: 'inspecting',
  'query-elements': 'inspecting',
  get: 'inspecting',
  console: 'inspecting',
  errors: 'inspecting',
  workspace: 'inspecting',
  selection: 'inspecting',
  'find-placement': 'inspecting',
  annotations: 'inspecting',
  annotation: 'inspecting',

  // interacting
  click: 'interacting',
  fill: 'interacting',
  type: 'interacting',
  select: 'interacting',
  hover: 'interacting',
  press: 'interacting',
  submit: 'interacting',
  scroll: 'interacting',
  scrollintoview: 'interacting',

  // creating
  create: 'creating',
  update: 'creating',
  upsert: 'creating',
  link: 'creating',
  unlink: 'creating',
  group: 'creating',
  ungroup: 'creating',
  annotate: 'creating',
  focus: 'creating',
  breakpoints: 'creating',
  ack: 'creating',
  resolve: 'creating',
  dismiss: 'creating',
  reply: 'creating',
  record: 'creating',

  // deleting
  delete: 'deleting',

  // waiting
  wait: 'waiting',
  screenshot: 'waiting',
  navigate: 'waiting',
  back: 'waiting',
  forward: 'waiting',
  reload: 'waiting',
}

const FLAT_POOLS: Record<'inspecting' | 'interacting' | 'waiting', string[]> = {
  inspecting: [
    'looking',
    'scanning',
    'peeking',
    'checking',
    'reading',
    'browsing',
    'poking around',
    'eyeballing',
  ],
  interacting: ['clicking', 'tapping', 'pressing', 'nudging', 'poking'],
  waiting: ['waiting', 'hanging on', 'loading', 'pausing', 'holding'],
}

const CREATE_PHRASES: Record<CanvasEntityKind, string[]> = {
  frame: ['dropping in', 'pulling in', 'adding'],
  text: ['adding', 'jotting', 'noting'],
  file: ['attaching', 'dropping in', 'adding'],
  group: ['grouping', 'wrapping up'],
  drawing: ['sketching', 'drawing'],
  edge: ['linking', 'connecting'],
}

const DELETE_PHRASES: Record<CanvasEntityKind, string[]> = {
  frame: ['removing', 'tearing down'],
  text: ['removing', 'clearing'],
  file: ['removing', 'detaching'],
  group: ['ungrouping', 'removing'],
  drawing: ['erasing', 'removing'],
  edge: ['unlinking', 'removing'],
}

const NOUN: Record<CanvasEntityKind, string> = {
  frame: 'frame',
  text: 'note',
  file: 'file',
  group: 'group',
  drawing: 'sketch',
  edge: 'link',
}

interface VerbLiteral {
  phrases: string[]
  preposition?: string
}

const VERB_LITERAL: Record<string, VerbLiteral> = {
  navigate: { phrases: ['heading to', 'loading', 'opening'] },
  back: { phrases: ['going back'] },
  forward: { phrases: ['going forward'] },
  reload: { phrases: ['reloading'] },
  screenshot: { phrases: ['snapping', 'capturing'] },
  fill: { phrases: ['typing', 'filling'], preposition: 'into' },
  type: { phrases: ['typing'], preposition: 'into' },
  scroll: { phrases: ['scrolling'] },
  scrollintoview: { phrases: ['scrolling to'] },
  hover: { phrases: ['hovering'], preposition: 'over' },
  link: { phrases: ['linking', 'connecting'] },
  unlink: { phrases: ['unlinking'] },
  group: { phrases: ['grouping'] },
  ungroup: { phrases: ['ungrouping'] },
}

export function binForVerb(verb: string): PhraseBin {
  return BIN_OF_VERB[verb] ?? 'waiting'
}

function poolFor(
  verb: string,
  bin: PhraseBin,
  entityKind: CanvasEntityKind | null,
): string[] {
  const literal = VERB_LITERAL[verb]
  if (literal) return literal.phrases
  if (bin === 'creating') {
    return entityKind ? CREATE_PHRASES[entityKind] : CREATE_PHRASES.frame
  }
  if (bin === 'deleting') {
    return entityKind ? DELETE_PHRASES[entityKind] : DELETE_PHRASES.frame
  }
  return FLAT_POOLS[bin]
}

export interface PhraseInput {
  verb: string
  /** Override the bin lookup. */
  bin?: PhraseBin
  /** Entity kind for canvas create/delete verbs. */
  entityKind?: CanvasEntityKind | null
  /** Human-readable target name if known (button text, field label, URL, direction). */
  targetName?: string | null
  /** Value being written (fill/type). */
  targetValue?: string | null
  /** Rotation index supplied by the caller; advances roughly every 1.5 s. */
  phraseIndex?: number
}

/**
 * Compose a label from the phrase pool. Returns null when the verb is
 * unmapped and has no literal override — lets callers fall back to the raw
 * verb or hide the label.
 */
export function composeLabel(input: PhraseInput): string | null {
  const bin = input.bin ?? binForVerb(input.verb)
  const pool = poolFor(input.verb, bin, input.entityKind ?? null)
  if (pool.length === 0) return null

  const idx = input.phraseIndex ?? 0
  const phrase = pool[((idx % pool.length) + pool.length) % pool.length]

  // Canvas create/delete: noun comes from entityKind.
  if ((bin === 'creating' || bin === 'deleting') && input.entityKind) {
    return `${phrase} ${NOUN[input.entityKind]}`
  }

  const literal = VERB_LITERAL[input.verb]
  const name = cleanField(input.targetName)
  const value = cleanField(input.targetValue)

  if (literal?.preposition && value && name) {
    return `${phrase} ${truncate(value, 24)} ${literal.preposition} ${name}`
  }
  if (literal?.preposition && name) {
    return `${phrase} ${literal.preposition} ${name}`
  }
  if (value && name) {
    return `${phrase} ${truncate(value, 24)} ${name}`
  }
  if (value) {
    return `${phrase} ${truncate(value, 24)}`
  }
  if (name) {
    return `${phrase} ${name}`
  }
  return phrase
}

/** Pool size for a (verb, entityKind) — callers use this to bound phraseIndex. */
export function poolSizeFor(
  verb: string,
  entityKind: CanvasEntityKind | null = null,
): number {
  return poolFor(verb, binForVerb(verb), entityKind).length
}

function cleanField(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1) + '…'
}
