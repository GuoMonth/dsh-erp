import type { LearningRuntime, ExplorationView } from './runtime.js'
import type { Scope } from '../storage/primitives.js'

export const EXPLORE_ID = 'explore'

export interface ExploreOutcome extends ExplorationView {
  pausedUntilLogin: boolean
  complete: boolean
}

function loginText(snapshot: string): boolean {
  return /type\s*=\s*["']password["']/i.test(snapshot)
    || /\b(?:textbox|entry)\s+"[^"\n]*password[^"\n]*"/i.test(snapshot)
    || (/"inputType"\s*:\s*"password"/i.test(snapshot))
}

/** A saved snapshot counts as the logged-in UI only when it is not a login form. */
export function loggedInUiVisible(snapshot: string | undefined): boolean {
  if (!snapshot?.trim()) return false
  if (loginText(snapshot)) return false
  try {
    const parsed = JSON.parse(snapshot) as { title?: string; controls?: { kind?: string; group?: string; name?: string; inputType?: string }[]; frames?: { text?: string; title?: string }[] }
    const controls = parsed.controls ?? []
    if (controls.some(control => control.inputType === 'password' || /password/i.test(control.name ?? ''))) return false
    const title = [parsed.title, ...(parsed.frames ?? []).map(frame => `${frame.title ?? ''} ${frame.text ?? ''}`)].join(' ')
    const menus = controls.some(control => control.group === 'navigation' || control.kind === 'menuitem' || control.kind === 'link' || control.kind === 'treeitem')
    if (/sign[\s-]?in|log[\s-]?in|登录|登陆/i.test(title) && !menus) return false
    return true
  } catch {
    if (/sign[\s-]?in|log[\s-]?in|登录|登陆/i.test(snapshot) && !/menuitem|navigation/i.test(snapshot)) return false
    return true
  }
}

function outcome(view: ExplorationView, pausedUntilLogin: boolean): ExploreOutcome {
  return {
    ...view, reason: pausedUntilLogin ? 'login-not-visible' : view.reason,
    pausedUntilLogin, complete: view.state === 'round-ended' && !pausedUntilLogin,
  }
}

/**
 * Start the controller-owned depth-3 round and persist it immediately.
 * Without a visible logged-in page the round pauses and is not marked complete.
 */
export async function startExplore(runtime: LearningRuntime, scope: Scope, signal: AbortSignal, observation?: { id: string; text: string }): Promise<ExploreOutcome> {
  let view = await runtime.status(scope, EXPLORE_ID, signal)
  if (!view) view = await runtime.begin(scope, EXPLORE_ID, signal)
  const visible = loggedInUiVisible(observation?.text)
  if (!visible) {
    if (view.state === 'running') view = await runtime.pause(scope, EXPLORE_ID, view.version, false, signal)
    if (view.state === 'round-ended') return outcome(view, false)
    return outcome(view, true)
  }
  if (view.state === 'paused') view = await runtime.pause(scope, EXPLORE_ID, view.version, true, signal)
  if (view.state === 'running' && observation && view.next) view = await runtime.accept(scope, EXPLORE_ID, view.version, observation.id, signal)
  return outcome(view, false)
}
