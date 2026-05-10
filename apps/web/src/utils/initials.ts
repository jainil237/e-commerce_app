export function getFirstLetter(value?: string): string {
  const firstWord = (value || '').trim().split(/\s+/)[0] || ''
  return firstWord.charAt(0).toUpperCase() || '?'
}
