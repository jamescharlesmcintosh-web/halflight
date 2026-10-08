/* ============================================================
   persist A? tiny, failure-safe local storage for player memory.
   The disc remembers who has already sat through the previews.
   ============================================================ */

const KEY = 'halflight.disc.v1'

interface DiscMemory {
  /** the opening (boot A? ident A? trailers A? title) has been seen */
  introSeen: boolean
  /** how many times the opening has run to completion or been skipped */
  plays: number
  /** last time the show was started */
  at: number
}

const BLANK: DiscMemory = { introSeen: false, plays: 0, at: 0 }

function read(): DiscMemory {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...BLANK }
    const parsed = JSON.parse(raw) as Partial<DiscMemory>
    return {
      introSeen: !!parsed.introSeen,
      plays: Number(parsed.plays) || 0,
      at: Number(parsed.at) || 0,
    }
  } catch {
    // private mode, disabled storage, corrupt payload A? behave like a first visit
    return { ...BLANK }
  }
}

function write(mem: DiscMemory) {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem))
  } catch {
    /* storage unavailable A? memory is a nicety, never a blocker */
  }
}

/** has this browser already watched the opening? */
export function hasSeenIntro(): boolean {
  return read().introSeen
}

/** record that the opening has been experienced (finished or skipped) */
export function markIntroSeen() {
  const mem = read()
  mem.introSeen = true
  mem.plays += 1
  mem.at = Date.now()
  write(mem)
}

/** forget it A? next start runs the full opening again */
export function forgetIntro() {
  const mem = read()
  mem.introSeen = false
  write(mem)
}

/** how many shows this browser has started (used for the welcome-back line) */
export function playCount(): number {
  return read().plays
}
