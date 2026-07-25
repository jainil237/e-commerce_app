// P3 exit gate: every text and badge token must clear its bar on every surface,
// in both themes, measured against the ACTUAL composited background.
import { readFileSync } from 'node:fs'

const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const parse = (h) => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) }
const toHex = (a) => '#' + a.map(v => Math.round(v).toString(16).padStart(2, '0').toUpperCase()).join('')
const lum = (h) => { const [r, g, b] = parse(h); return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b) }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const over = (fg, bg, a) => { const F = parse(fg), B = parse(bg); return toHex(F.map((c, i) => a * c + (1 - a) * B[i])) }

const AAA = 7.0
let failures = []

const read = (path) => {
  const css = readFileSync(path, 'utf8')
  const grab = (block, name) => {
    const seg = css.split(block)[1] || ''
    const m = seg.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))
    return m && m[1]
  }
  return {
    light: { s: [grab(':root', 'surface-0'), grab(':root', 'surface-1'), grab(':root', 'surface-2')], t: { primary: grab(':root', 'text-primary'), secondary: grab(':root', 'text-secondary'), tertiary: grab(':root', 'text-tertiary'), brand: grab(':root', 'brand-primary') } },
    dark: { s: [grab('.dark', 'surface-0'), grab('.dark', 'surface-1'), grab('.dark', 'surface-2')], t: { primary: grab('.dark', 'text-primary'), secondary: grab('.dark', 'text-secondary'), tertiary: grab('.dark', 'text-tertiary'), brand: grab('.dark', 'brand-primary') } },
    css,
  }
}

for (const app of ['web', 'admin']) {
  const { light, dark, css } = read(`apps/${app}/src/app/globals.css`)
  console.log(`\n===== apps/${app} =====`)
  for (const [theme, cfg] of [['light', light], ['dark', dark]]) {
    console.log(`  -- ${theme} (surfaces ${cfg.s.join(' ')})`)
    for (const [name, val] of Object.entries(cfg.t)) {
      const rs = cfg.s.map(s => ratio(val, s))
      const min = Math.min(...rs)
      const ok = min >= AAA
      if (!ok) failures.push(`${app}/${theme}/text-${name} ${val} = ${min.toFixed(2)}`)
      console.log(`     ${name.padEnd(10)} ${val}  ${rs.map(r => r.toFixed(2)).join('  ')}  min ${min.toFixed(2)}  ${ok ? 'AAA' : 'FAIL'}`)
    }
  }

  // badges: text-[#hex] dark:text-[#hex] over their own tint
  const tint = { emerald: '#10B981', amber: '#F59E0B', red: '#EF4444', blue: '#3B82F6', slate: '#64748B' }
  const re = /bg-(emerald|amber|red|blue|slate)-500\/10 text-\[(#[0-9A-Fa-f]{6})\] dark:text-\[(#[0-9A-Fa-f]{6})\]/g
  console.log('  -- badges (text over own 10% tint on the surface)')
  let m, seen = 0
  while ((m = re.exec(css))) {
    seen++
    const [, hue, lightC, darkC] = m
    const bgL = over(tint[hue], light.s[0], 0.1)
    const bgD = over(tint[hue], dark.s[0], 0.1)
    const rL = ratio(lightC, bgL), rD = ratio(darkC, bgD)
    if (rL < AAA) failures.push(`${app}/light/badge-${hue} ${lightC} = ${rL.toFixed(2)}`)
    if (rD < AAA) failures.push(`${app}/dark/badge-${hue} ${darkC} = ${rD.toFixed(2)}`)
    console.log(`     ${hue.padEnd(8)} light ${lightC} on ${bgL} = ${rL.toFixed(2)} ${rL >= AAA ? 'AAA' : 'FAIL'}   dark ${darkC} on ${bgD} = ${rD.toFixed(2)} ${rD >= AAA ? 'AAA' : 'FAIL'}`)
  }
  if (seen !== 5) failures.push(`${app}: expected 5 badge rules, matched ${seen}`)

  // font-size floor
  if (/text-\[10px\]/.test(css)) failures.push(`${app}: text-[10px] still present`)
}

console.log('\n' + '='.repeat(60))
if (failures.length) { console.log('FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
console.log('PASS: every text and badge token clears 7:1 on every surface, both themes, both apps.')
