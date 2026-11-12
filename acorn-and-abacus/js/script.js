// The recording script: every clip the guide can say, grouped by activity.
// Each line: { key, text, note?, optional?, core?, caption?, tts? }
//   key       stable id; the clip lives at audio/<key>.webm (listed in audio/manifest.json)
//   text      exactly what to say
//   note      how to say it, where that matters
//   optional  the game skips it quietly if it isn't recorded
//   core      numbers, letter sounds and word endings: the clips most worth recording first
//             (the recorder lists them first)
//   caption   text shown on screen when it differs from text
//   tts       developer-only text for the ?tts=1 speech fallback (defaults to text)
//
// Lines are built from clips: "You're on" + "17" + "What comes next?".
// Numbers 21-99 (except tens) are not recorded: the game plays the tens clip and then
// the ones clip with no gap, so "seventy" + "three" gives 73.

// The guide's name. Change it here and every caption follows.
export const GUIDE_NAME = 'Pip';

const L = (key, text, note, extra = {}) => ({ key, text, ...(note ? { note } : {}), ...extra });

// ---- letters: name, pure sound and optional anchor word, with a picture for the card ----
// tts/fast are only for the developer fallback; Ryan records the real sound.
export const LETTERS = {
  a: { say: 'ay', pure: 'a', how: 'short a as in ant, held', tts: 'aah', word: 'ant', pic: 'ant' },
  b: { say: 'bee', pure: 'b', how: 'clipped, no "uh" after it', tts: 'buh', fast: true, word: 'butterfly', pic: 'butterfly' },
  c: { say: 'see', pure: 'k', how: 'clipped "k" as in cat, no "uh"', tts: 'kuh', fast: true, word: 'cat', pic: '🐈' },
  d: { say: 'dee', pure: 'd', how: 'clipped, no "uh"', tts: 'duh', fast: true, word: 'dog', pic: '🐕' },
  e: { say: 'ee', pure: 'e', how: 'short e as in egg', tts: 'eh', word: 'egg', pic: '🥚' },
  f: { say: 'ef', pure: 'fff', how: 'held, breathy', tts: 'fff', word: 'fish', pic: '🐟' },
  g: { say: 'jee', pure: 'g', how: 'hard g as in goat, clipped', tts: 'guh', fast: true, word: 'goat', pic: '🐐' },
  h: { say: 'aitch', pure: 'h', how: 'a short breath, no "uh"', tts: 'huh', fast: true, word: 'hat', pic: '🎩' },
  i: { say: 'eye', pure: 'i', how: 'short i as in insect', tts: 'ih', word: 'insect', pic: '🐛' },
  j: { say: 'jay', pure: 'j', how: 'clipped, no "uh"', tts: 'juh', fast: true, word: 'juice', pic: '🧃' },
  k: { say: 'kay', pure: 'k', how: 'clipped, no "uh"', tts: 'kuh', fast: true, word: 'kite', pic: '🪁' },
  l: { say: 'el', pure: 'lll', how: 'held', tts: 'lll', word: 'ladybug', pic: 'ladybug' },
  m: { say: 'em', pure: 'mmm', how: 'held hum', tts: 'mmm', word: 'moth', pic: 'moth' },
  n: { say: 'en', pure: 'nnn', how: 'held', tts: 'nnn', word: 'nest', pic: '🪺' },
  o: { say: 'oh', pure: 'o', how: 'short o as in octopus', tts: 'ah', word: 'octopus', pic: '🐙' },
  p: { say: 'pee', pure: 'p', how: 'clipped puff, no "uh"', tts: 'puh', fast: true, word: 'pig', pic: '🐖' },
  q: { say: 'cue', pure: 'kw', how: '"kw" as in queen, clipped', tts: 'kwuh', fast: true, word: 'queen', pic: '👑' },
  r: { say: 'ar', pure: 'rrr', how: 'held', tts: 'rrr', word: 'race car', pic: '🏎️' },
  s: { say: 'ess', pure: 'sss', how: 'held hiss', tts: 'sss', word: 'sun', pic: '☀️' },
  t: { say: 'tee', pure: 't', how: 'clipped, no "uh"', tts: 'tuh', fast: true, word: 'truck', pic: 'monster-truck' },
  u: { say: 'you', pure: 'u', how: 'short u as in umbrella', tts: 'uh', word: 'umbrella', pic: '☂️' },
  v: { say: 'vee', pure: 'vvv', how: 'held buzz', tts: 'vvv', word: 'van', pic: '🚐' },
  w: { say: 'double-you', pure: 'w', how: 'short "w", no "uh"', tts: 'wuh', fast: true, word: 'worm', pic: '🪱' },
  x: { say: 'ex', pure: 'ks', how: '"ks" as at the end of fox', tts: 'ks', fast: true, word: 'fox', pic: '🦊' },
  y: { say: 'why', pure: 'y', how: 'short "y" as in yo-yo, no "uh"', tts: 'yuh', fast: true, word: 'yo-yo', pic: '🪀' },
  z: { say: 'zee', pure: 'zzz', how: 'held buzz', tts: 'zzz', word: 'zebra', pic: '🦓' },
};


// ---- words with pictures, for First Sounds and Sound Builder ----
//   first   the letter it starts with (its pure sound is the first sound)
//   sounds  letters whose pure sounds blend into the word (Sound Builder), e.g. 'sun'. Only CVC words
//           whose letters map one to one onto their sounds: no x (/ks/), ck, double letters or silent e
//   rime    the word without its first sound, for two-part blending (s … un)
//   avoid   first sounds this picture could be mistaken for (race car: "car"), so it is never
//           a wrong choice next to that sound
// Left out on purpose: unicorn ("yoo" is a /y/ sound, not short u), truck (the "tr" start
// sounds like "ch"), hen and rabbit (most children say chicken and bunny), bug (no clear picture).
export const WORDS = {
  moth: { pic: 'moth', first: 'm', avoid: 'b' },
  moon: { pic: '🌙', first: 'm' },
  monkey: { pic: '🐒', first: 'm' },
  mouse: { pic: '🐭', first: 'm', avoid: 'r' },
  map: { pic: '🗺️', first: 'm', sounds: 'map', rime: 'ap' },
  sun: { pic: '☀️', first: 's', sounds: 'sun', rime: 'un' },
  sock: { pic: '🧦', first: 's' },
  seal: { pic: '🦭', first: 's' },
  fish: { pic: '🐟', first: 'f' },
  fox: { pic: '🦊', first: 'f', avoid: 'd' },
  foot: { pic: '🦶', first: 'f' },
  ladybug: { pic: 'ladybug', first: 'l', avoid: 'b' },
  lion: { pic: '🦁', first: 'l', avoid: 'ck' },
  lemon: { pic: '🍋', first: 'l' },
  leg: { pic: '🦵', first: 'l', sounds: 'leg', rime: 'eg' },
  rainbow: { pic: '🌈', first: 'r' },
  racecar: { text: 'race car', pic: '🏎️', first: 'r', avoid: 'ck' },
  robot: { pic: '🤖', first: 'r' },
  rat: { pic: '🐀', first: 'r', sounds: 'rat', rime: 'at', avoid: 'm' },
  nest: { pic: '🪺', first: 'n', avoid: 'e' },
  nose: { pic: '👃', first: 'n' },
  van: { pic: '🚐', first: 'v', sounds: 'van', rime: 'an', avoid: 'bck' },
  volcano: { pic: '🌋', first: 'v', avoid: 'm' },
  zebra: { pic: '🦓', first: 'z' },
  butterfly: { pic: 'butterfly', first: 'b' },
  bus: { pic: '🚌', first: 'b', sounds: 'bus' },
  banana: { pic: '🍌', first: 'b' },
  bear: { pic: '🐻', first: 'b', avoid: 't' },
  bed: { pic: '🛏️', first: 'b', sounds: 'bed' },
  bat: { pic: '🦇', first: 'b', sounds: 'bat' },
  box: { pic: '📦', first: 'b' },
  tiger: { pic: '🐅', first: 't', avoid: 'ck' },
  tent: { pic: '⛺', first: 't' },
  tomato: { pic: '🍅', first: 't' },
  cat: { pic: '🐈', first: 'c', sounds: 'cat' },
  cake: { pic: '🎂', first: 'c' },
  cow: { pic: '🐄', first: 'c' },
  carrot: { pic: '🥕', first: 'c' },
  cup: { pic: '☕', first: 'c', sounds: 'cup', avoid: 'm' },
  kite: { pic: '🪁', first: 'k' },
  key: { pic: '🔑', first: 'k' },
  dog: { pic: '🐕', first: 'd', sounds: 'dog', avoid: 'p' },
  duck: { pic: '🦆', first: 'd' },
  dinosaur: { pic: '🦕', first: 'd' },
  pig: { pic: '🐖', first: 'p', sounds: 'pig' },
  pizza: { pic: '🍕', first: 'p' },
  penguin: { pic: '🐧', first: 'p' },
  goat: { pic: '🐐', first: 'g', avoid: 's' },
  ghost: { pic: '👻', first: 'g' },
  guitar: { pic: '🎸', first: 'g' },
  house: { pic: '🏠', first: 'h' },
  hat: { pic: '🎩', first: 'h', sounds: 'hat' },
  hand: { pic: '✋', first: 'h' },
  ant: { pic: 'ant', first: 'a' },
  apple: { pic: '🍎', first: 'a' },
  egg: { pic: '🥚', first: 'e' },
  elephant: { pic: '🐘', first: 'e' },
  whale: { pic: '🐳', first: 'w', avoid: 'f' },
  watermelon: { pic: '🍉', first: 'w' },
  web: { pic: '🕸️', first: 'w', sounds: 'web' },
};
for (const [id, w] of Object.entries(WORDS)) {
  w.id = id;
  w.text ??= id;
  if (typeof w.sounds === 'string') w.sounds = [...w.sounds];
}

const numbers = [];
for (let n = 0; n <= 20; n++) numbers.push(L(`num-${n}`, String(n), n === 20 ? 'also used as the "twenty" in 21-29' : null, { core: true }));
for (let n = 30; n <= 90; n += 10) numbers.push(L(`num-${n}`, String(n), 'said on its own; the ones clip follows straight after for 31-99', { core: true }));
numbers.push(L('num-100', '100', null, { core: true }));

const letters = [];
for (const [ch, l] of Object.entries(LETTERS)) {
  const C = ch.toUpperCase();
  letters.push(L(`letter-name-${ch}`, C, `the letter name, "${l.say}"`, { tts: l.say }));
  letters.push(L(`letter-pure-${ch}`, l.pure, `pure sound: ${l.how}`, { core: true, caption: `/${l.pure}/`, tts: [{ t: l.tts, rate: l.fast ? 1.6 : 1 }] }));
  letters.push(L(`letter-word-${ch}`, `like ${l.word}.`, 'anchor word, played after the sound', { optional: true }));
}


const words = Object.values(WORDS).map((w) => L(`word-${w.id}`, w.text, null));
const rimes = Object.values(WORDS).filter((w) => w.rime).map((w) => L(`sb-r-${w.rime}`, w.rime,
  `the end of "${w.text}" on its own, without the first sound`, { core: true, caption: `-${w.rime}` }));

export const SCRIPT = [
  { group: 'Pip and the home screen', lines: [
    L('ui-hello', `Hello! I'm ${GUIDE_NAME}.`),
    L('ui-pick', 'Pick a game. Point at a picture to hear its name.'),
    L('ui-home-btn', 'Back to the games.', 'spoken when she points at the house button'),
    L('act-number-path', 'Number path. Count along the path.', 'spoken when she points at the game'),
    L('act-quick-look', 'Quick look. How many bugs?', 'spoken when she points at the game'),
    L('act-letter-sounds', 'Letter sounds. Find the letter.', 'spoken when she points at the game'),
    L('act-make-ten', 'Make ten. Find the rainbow pairs.', 'spoken when she points at the game'),
    L('act-first-sounds', 'First sounds. Listen to the start.', 'spoken when she points at the game'),
    L('act-sound-builder', 'Sound builder. Put the sounds together.', 'spoken when she points at the game'),
    L('ui-break', 'That was lovely playing. It\'s a good time for a break.', 'calm, winding down'),
    L('ui-back', 'Welcome back!'),
    L('ui-click', 'Click', 'a number follows: "Click … nine"'),
    L('ui-listen', 'Listen.'),
  ] },
  { group: 'Number Path', lines: [
    L('np-who', 'Who will you play with?'),
    L('np-with-grownup', 'Play with a grown-up.', 'spoken on hover'),
    L('np-with-guide', 'Play with me!', 'spoken on hover'),
    L('np-intro', 'Take turns along the path.'),
    L('np-pick-token', 'Who will you be?'),
    L('np-tok-car', 'The red race car.', 'spoken on hover'),
    L('np-tok-truck', 'The monster truck.', 'spoken on hover'),
    L('np-tok-unicorn', 'The unicorn.', 'spoken on hover'),
    L('np-your-turn', 'Your turn. Click the spinner.'),
    L('np-gu-turn', 'Grown-up\'s turn. Click the spinner.'),
    L('np-my-turn', 'My turn.'),
    L('np-you-spun', 'You spun', 'a number follows'),
    L('np-gu-spun', 'Grown-up spun', 'a number follows'),
    L('np-i-spun', 'I spun', 'a number follows'),
    L('np-count-on', 'Count on. Click the next square.'),
    L('np-count-from-start', 'Click each square as you count.'),
    L('np-youre-on', 'You\'re on', 'a number follows'),
    L('np-what-next', 'What comes next?'),
    L('np-at-start', 'You\'re at the start. Start with one.'),
    L('np-together', 'Let\'s count together.'),
    L('np-predict-q', 'Where will you land?'),
    L('np-start-on', 'Start on', 'a number follows'),
    L('np-count', 'Count', 'a number follows, then "more"'),
    L('np-more', 'more.'),
    L('np-land-yes', 'Yes! Let\'s count on to check.'),
    L('np-land-on', 'You will land on', 'a number follows'),
    L('np-reached-you', 'You reached', 'a number follows'),
    L('np-reached-gu', 'Grown-up reached', 'a number follows'),
    L('np-reached-me', 'I reached', 'a number follows'),
    L('np-good-game', 'That was a lovely game. Let\'s play again.', 'calm'),
    L('praise-np-from-1', 'You counted on from', 'a number follows'),
    L('praise-np-from-2', 'Good counting on from', 'a number follows'),
    L('praise-np-start-1', 'You counted from the start!'),
    L('praise-np-start-2', 'You counted every square.'),
    L('praise-np-predict', 'You knew where you would land!'),
  ] },
  { group: 'Quick Look', lines: [
    L('ql-look', 'Look quickly! How many?'),
    L('ql-how-many', 'How many did you see?'),
    L('ql-look-again', 'Let\'s look again.'),
    L('ql-count-together', 'Let\'s count them together.'),
    L('ql-more-q', 'Which leaf has more bugs?'),
    L('ql-more-again', 'Look again. Which leaf has more?'),
    L('ql-this-leaf', 'This leaf has', 'a number follows'),
    L('ql-that-leaf', 'That leaf has', 'a number follows'),
    L('ql-click-more', 'Click the leaf with more.'),
    L('ql-bigger-q', 'Which number is bigger?'),
    L('ql-which-bigger', 'Which is bigger?'),
    L('ql-is-bigger-than', 'is bigger than', 'between two numbers: "41 … is bigger than … 14"'),
    L('praise-ql-dots-1', 'You saw it fast.'),
    L('praise-ql-dots-2', 'You saw them all at once.'),
    L('praise-ql-frame-a', 'Five and', 'a number follows, then "more"'),
    L('praise-ql-frame-b', 'more.'),
    L('praise-ql-frame-full', 'The frame is full.'),
    L('praise-ql-more-1', 'You looked carefully. That leaf has more.'),
    L('praise-ql-more-2', 'Yes! You compared the leaves.'),
    L('praise-ql-tens', 'You looked at the tens.'),
    L('praise-ql-later', 'It comes later when you count.'),
  ] },
  { group: 'Letter Sounds', lines: [
    L('ls-which', 'Which letter says', 'a pure sound follows'),
    L('ls-thats', 'That\'s', 'a letter name follows'),
    L('ls-it-says', 'It says', 'a pure sound follows'),
    L('ls-says', 'says', 'between a letter name and its sound: "M … says … mmm"'),
    L('ls-which-one', 'Which one?'),
    L('ls-this-one', 'This one says', 'a pure sound follows'),
    L('ls-click-it', 'Click it.'),
    L('ls-key-find', 'Find this letter on the keyboard.'),
    L('ls-look-for', 'Look for this letter.'),
    L('ls-key-glow', 'Look at the glowing key.'),
    L('praise-ls-1', 'You listened for the sound.'),
    L('praise-ls-2', 'Good listening.'),
    L('praise-ls-key-1', 'You found it on the keyboard.'),
    L('praise-ls-key-2', 'You pressed the key for that sound.'),
  ] },
  { group: 'Make Ten', lines: [
    L('mt-fill-q', 'How many more fill the frame?'),
    L('mt-and-how-many', 'and how many make', 'between two numbers: "7 … and how many make … 10?"'),
    L('mt-click-empty', 'Click the empty squares to count them.'),
    L('mt-count-on-from', 'Count on from', 'a number follows'),
    L('mt-and', 'and', 'between two numbers: "7 … and … 3 … make … 10"'),
    L('mt-make', 'make', 'between numbers: "… make … 10"'),
    L('mt-thats', 'That\'s', 'a number follows, then "more"'),
    L('mt-more', 'more.'),
    L('mt-new-rainbow', 'Let\'s make a rainbow.'),
    L('mt-rainbow', 'A whole rainbow!', 'the finish of a round, warm and delighted'),
    L('mt-every-pair', 'Every pair makes', 'a number follows'),
    L('praise-mt-1', 'You found a rainbow pair.'),
    L('praise-mt-2', 'You found the missing part.'),
  ] },
  { group: 'First Sounds', lines: [
    L('fs-which', 'Which one starts with', 'a pure sound follows'),
    L('fs-starts-with', 'starts with', 'between a word and a sound or letter: "moth … starts with … mmm"'),
    L('fs-which-letter', 'Which letter does it start with?'),
    L('praise-fs-1', 'You listened for the first sound.'),
    L('praise-fs-2', 'You heard the first sound.'),
    L('praise-fs-letter', 'You matched the sound to its letter.'),
  ] },
  { group: 'Sound Builder', lines: [
    L('sb-which', 'Which picture is it?'),
    L('sb-again', 'Listen again.'),
    L('praise-sb-1', 'You put the sounds together.'),
    L('praise-sb-2', 'You heard the whole word.'),
    ...rimes,
  ] },
  { group: 'Words', lines: words },
  { group: 'Numbers', lines: numbers },
  { group: 'Letters', lines: letters },
];

// Flat lookup: key -> line.
export const LINES = Object.fromEntries(SCRIPT.flatMap((g) => g.lines).map((l) => [l.key, l]));
export const ALL_KEYS = Object.keys(LINES);
