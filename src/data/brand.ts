/* ============================================================
   HALF-LIGHT VIDEO — brand spine
   Everything the experience says about itself lives here.
   ============================================================ */

export type Tone = 'ink' | 'amber' | 'red' | 'cyan' | 'bone'

export interface MenuItem {
  id: string
  label: string
  sub: string
  code: string
  /** short line read aloud in the chrome */
  hint: string
}

export interface Chapter {
  n: string
  title: string
  time: string
  log: string
  note: string
}

export interface Trailer {
  id: string
  kicker: string
  title: string
  sub: string
  log: string
  tone: Tone
  duration: number
}

export interface Title {
  slug: string
  title: string
  dir: string
  year: number
  run: string
  aspect: string
  format: string
  ed: string
  blurb: string
  stock: 'in' | 'low' | 'pre' | 'out'
}

export const BRAND = {
  name: 'Half-Light Video',
  wordmark: ['HALF-LIGHT', 'VIDEO'],
  strap: 'Restored films, pressed in small runs',
  city: 'Rotterdam',
  cat: 'CAT 2025',
  disc: 'DVD-9',
  feature: 'Night Shift',
  featureDir: 'Mira Voss',
  featureYear: '1998',
  featureRun: '92 min',
  featureAspect: '1.33:1',
  featureCat: 'No. 0401',
  runs: '2,000',
  email: 'dist@halflight.video',
  address: 'Katshoek 12, Rotterdam',
} as const

export const MENU: MenuItem[] = [
  { id: 'play',    label: 'Play Feature',     sub: 'Night Shift · 92 min',        code: '01', hint: 'Play the feature' },
  { id: 'scenes',  label: 'Scene Selection',  sub: 'Five chapters',               code: '02', hint: 'Choose a chapter' },
  { id: 'behind',  label: 'Behind the Scenes',sub: 'The restoration, in full',    code: '03', hint: 'How the disc was made' },
  { id: 'special', label: 'Special Features', sub: 'Six supplements',             code: '04', hint: 'Commentary and extras' },
  { id: 'catalogue',label:'Catalogue Index',  sub: 'Eight titles in print',       code: '05', hint: 'The whole catalogue' },
  { id: 'settings',label: 'Audio & Settings', sub: 'Sound · Picture · Motion',    code: '06', hint: 'Adjust the player' },
]

export const CHAPTERS: Chapter[] = [
  { n: '01', title: 'Arrival',        time: '00:00', log: 'The structure is still open.',      note: 'Sixteen frames of sodium light before anything happens.' },
  { n: '02', title: 'Last Call',      time: '18:40', log: 'Everything closes at two.',          note: 'Shot on the last night the arcade traded.' },
  { n: '03', title: 'Night Shift',    time: '36:05', log: 'One car never leaves.',              note: 'The film is named after this bay.' },
  { n: '04', title: 'The Vacant Lot', time: '58:22', log: 'A lamp, and what it will not reach.', note: 'The only scene with no dialogue.' },
  { n: '05', title: 'Morning Static', time: '78:14', log: 'The hour comes back.',               note: 'The last shot holds for ninety seconds.' },
]

export const TRAILERS: Trailer[] = [
  {
    id: 'restoration',
    kicker: 'Coming Attraction',
    title: 'The Restoration',
    sub: 'Frame by frame, by hand',
    log: 'Dirt, scratches and tape damage, repaired on a bench in Rotterdam.',
    tone: 'amber',
    duration: 5.6,
  },
  {
    id: 'screening',
    kicker: 'Coming Attraction',
    title: 'The Screening',
    sub: 'Eleven venues. One negative.',
    log: 'Repertory cinemas, festivals and micro-cinemas, under one beam.',
    tone: 'red',
    duration: 5.6,
  },
  {
    id: 'pressing',
    kicker: 'Coming Attraction',
    title: 'The Pressing',
    sub: '2,000 numbered by hand',
    log: 'Limited runs. Foil-stamped sleeves. Shipped on Thursdays.',
    tone: 'cyan',
    duration: 5.6,
  },
]

export const TITLES: Title[] = [
  { slug: 'night-shift',       title: 'Night Shift',       dir: 'Mira Voss',       year: 1998, run: '92 min',  aspect: '1.33:1', format: 'DVD-5', ed: 'No. 0401', stock: 'in',  blurb: 'A parking attendant works the last shift of the year. At 02:17 the structure empties and one car never leaves.' },
  { slug: 'concrete-hours',    title: 'Concrete Hours',    dir: 'Ilya Renner',     year: 1996, run: '104 min', aspect: '1.85:1', format: 'DVD-5', ed: 'No. 0117', stock: 'low', blurb: 'Three night porters share a single key and a building that will not sleep.' },
  { slug: 'the-long-corridor', title: 'The Long Corridor', dir: 'Sunniva Aalto',   year: 1988, run: '88 min',  aspect: '1.66:1', format: 'DVD-9', ed: 'No. 0042', stock: 'in',  blurb: 'A hotel corridor, a lost envelope, and eleven minutes that never appear on the register.' },
  { slug: 'static-season',     title: 'Static Season',     dir: 'Mira Voss',       year: 2001, run: '97 min',  aspect: '1.33:1', format: 'DVD-5', ed: 'No. 0233', stock: 'pre', blurb: 'A radio engineer keeps a station on the air for an audience that has already gone home.' },
  { slug: 'dry-season',        title: 'Dry Season',        dir: 'Peter Osei',      year: 1994, run: '71 min',  aspect: '1.33:1', format: 'DVD-5', ed: 'No. 0088', stock: 'in',  blurb: 'A coastal town records its own weather, then loses the tape.' },
  { slug: 'the-frequency',     title: 'The Frequency',     dir: 'Hanae Morioka',   year: 2003, run: '112 min', aspect: '1.85:1', format: 'DVD-9', ed: 'No. 0290', stock: 'low', blurb: 'A late-night call-in show takes one call too many.' },
  { slug: 'low-beam',          title: 'Low Beam',          dir: 'Marcus Lindqvist',year: 1991, run: '79 min',  aspect: '1.66:1', format: 'DVD-5', ed: 'No. 0061', stock: 'in',  blurb: 'A delivery driver, a wet road, and the same six streets every night.' },
  { slug: 'rota',              title: 'Rota',              dir: 'Elin Haugen',     year: 1999, run: '64 min',  aspect: '1.33:1', format: 'DVD-5', ed: 'No. 0155', stock: 'in',  blurb: 'A factory shift, photographed from the inside over four winters.' },
]

export const FEATURES = [
  { run: '12:06', title: 'Behind the Scenes: Night Shift', desc: 'Documentary on the final overnight production block, including unused footage from the convenience-store location.', rest: 'Transferred from the original Betacam master' },
  { run: '92:00', title: 'Director\u2019s Commentary: The City After Dark', desc: 'Mira Voss discusses the city as a character and the decision to preserve silence at the end of the film.', rest: 'Recorded at the 2024 restoration screening' },
  { run: '04:18', title: 'Deleted Scene: The Empty Platform', desc: 'A silent, uncompleted sequence set beneath the station canopy, restored here from a surviving work print.', rest: 'Restored from the surviving work print' },
  { run: '08:42', title: 'Restoration Demo: From Tape to HD', desc: 'A side-by-side look at the analog source tape, the scan process, and the final preservation master.', rest: 'Documented during the 2025 transfer' },
  { run: '02:11', title: 'Original Theatrical Trailer', desc: 'The complete original theatrical trailer, restored from a single surviving 35mm answer print.', rest: 'Restored from a 35mm answer print' },
  { run: '36 stills', title: 'Photo Gallery: Production Stills', desc: 'Thirty-six stills from the production archive, arranged in shooting order with negative numbers retained.', rest: 'Scanned from the production negative file' },
]

export const NOTES = [
  { i: 'Note 01', t: 'The Restoration', p: 'Scanned from the original 16mm negative. Dirt, scratches and tape damage repaired by hand, frame by frame. The grain structure has been preserved.' },
  { i: 'Note 02', t: 'The Aspect Ratio', p: 'The original 1.33:1 composition is preserved. The image is presented as it was photographed and projected in 1998.' },
  { i: 'Note 03', t: 'The Production Design', p: 'Sodium-vapour lamps, fluorescent office light, reflective asphalt and hand-lettered signs form the film\u2019s visual language.' },
  { i: 'Note 04', t: 'The Soundtrack', p: 'The soundtrack preserves tape hiss, distant traffic and the low electrical hum of fluorescent lights.' },
]

export const PLACEMENTS = [
  { k: 'What ships', v: 'DCP, DVD or digital', d: 'Unencrypted DCP on request. Press stills, a dialogue list and a trailer for your listings.' },
  { k: 'Terms', v: 'Per screening or by run', d: 'From £180 per screening. Weekly runs and festival packages quoted individually.' },
  { k: 'Recent', v: 'Rotterdam · Leeds · Ljubljana', d: 'Night Shift has screened at eleven repertory venues since the 2024 restoration.' },
]

/* ---- the feature journey: five bays of the archive ---- */
export interface Bay {
  n: string
  title: string
  kicker: string
  line: string
  body: string
  t: number // 0..1 along the corridor
}

export const BAYS: Bay[] = [
  { n: '01', title: 'Arrival', kicker: 'The find', t: 0.02,
    line: 'A can, a label, a negative nobody had opened in twenty-six years.',
    body: 'Every title in this catalogue began as a physical object in a bad room. Reels as received, before inspection, before anyone knew what was on them.' },
  { n: '02', title: 'The Gate', kicker: 'The scan', t: 0.24,
    line: 'Sixteen millimetre through a scanner gate, one frame at a time.',
    body: 'Dirt, scratches and tape damage are repaired by hand. The grain structure is left exactly where it is. We do not clean the photograph out of the film.' },
  { n: '03', title: 'The Bench', kicker: 'The grade', t: 0.46,
    line: 'Sodium, fluorescent, wet asphalt. The light is the script.',
    body: 'The original 1.33:1 composition is preserved. The picture is timed to the reference print, not to a modern idea of what 1998 should look like.' },
  { n: '04', title: 'The Press', kicker: 'The run', t: 0.68,
    line: 'Two thousand sleeves, numbered by hand after replication.',
    body: 'Pressed editions ship from Rotterdam every Thursday. Digital HD travels with every title, so the disc is never the only way in.' },
  { n: '05', title: 'The Screen', kicker: 'The room', t: 0.92,
    line: 'The whole point of the object is the dark room it opens into.',
    body: 'We license to repertory cinemas, festivals and micro-cinemas. Quote in two working days. Payment after the licence is issued.' },
]

export const CREDITS = [
  ['Restoration & transfer', 'Half-Light Video, Rotterdam'],
  ['Picture', '16mm negative → 4K wet-gate scan'],
  ['Sound', 'Optical track, restored 2024'],
  ['Replication', 'DVD-5 / DVD-9, replicated EU'],
  ['Sleeve', 'Foil-stamped, numbered 001–2000'],
  ['Exhibition', 'Repertory & festival, worldwide'],
  ['Catalogue', 'Eight titles in print, 2025'],
]
