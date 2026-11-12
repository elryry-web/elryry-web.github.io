// Every activity, in home-screen order. The home grid has room for six.
// An activity is { id, nameKey, label, icon(), steps:[{label, ...}], grownUp:{ask, offscreen}, run(ctx) }.
import numberPath from './number-path.js';
import quickLook from './quick-look.js';
import letterSounds from './letter-sounds.js';
import makeTen from './make-ten.js';
import firstSounds from './first-sounds.js';
import soundBuilder from './sound-builder.js';

export const ACTIVITIES = [numberPath, quickLook, letterSounds, makeTen, firstSounds, soundBuilder];
