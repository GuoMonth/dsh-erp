export type BrowserEffect = 'navigate' | 'mutate'

/** Fill and select are ERP mutations. Scroll only navigates. A click must say which one it is. */
export function classifyEffect(operation: string, effect: string): BrowserEffect {
  if (operation === 'fill' || operation === 'select') {
    if (effect !== 'mutate') throw new Error('ERP_MUTATION_EFFECT_REQUIRED')
    return 'mutate'
  }
  if (operation === 'scroll') {
    if (effect !== 'navigate') throw new Error('ERP_NAVIGATION_EFFECT_REQUIRED')
    return 'navigate'
  }
  if (operation === 'click' && (effect === 'navigate' || effect === 'mutate')) return effect
  throw new Error('ERP_EFFECT_REQUIRED')
}
