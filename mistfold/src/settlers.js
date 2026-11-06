// Settlers: how their homes grow over days in the land you chose, and what they say at each stage.
import * as M from './models.js';
import { state, flag, setFlag } from './state.js';

export const SETTLER_LOOKS = {
  flicker: {
    tent: 0xe8c890,
    voice: { pitch: 2.6, wave: 'sine' }, color: '#7a9ac8',
    model: () => M.makeWisp(0xffd890),
    house: (lit) => {
      const g = M.makeCottage({ wall: 0xf3e3c8, roofC: 0x5a6a9a, lit: true, w: 2.2, d: 2, h: 1.6 });
      return g;
    },
    r: 1.6,
    extras: (L, x, z) => {
      for (let i = 0; i < 4; i++) L.place(M.makeLamppost(true, 0xffd890), x - 3 + i * 2, z + 3.5, { r: 0.2 });
    },
    talk: async (D, stage) => {
      if (stage === 0) {
        await D.say('this is the place? it smells like warm stones. i like it already, i think, is that too fast to like a place?');
        await D.say('some mice are going to help build. well, they said they would, and then they looked at me funny, but i think that means yes.');
      } else if (stage === 1) {
        await D.say('there are walls now! nearly walls! i keep going inside to see what it looks like with me in it.');
      } else {
        if (!flag('flicker.home')) {
          setFlag('flicker.home');
          await D.say('look, look, it has a window. i sit in it at night and people walking past can see where they are.');
          await D.say('nobody\'s made soup yet. but there\'s a kitchen, so it could happen any time, couldn\'t it?');
          await D.say('thank you. um. i don\'t know what you say after thank you. is there a second part?');
          D.lumen(30);
        } else {
          await D.say(['i put the lamps out on the path. i mean i lit them. putting them out is the other thing, i don\'t do that.', 'did you know moths visit me? they\'re very polite. they sit very close and don\'t say anything.', 'someone walked past last night and waved at the window. i waved back with my whole self.'][state.day % 3]);
        }
      }
    },
  },
  mumbleroots: {
    tent: 0xb89a6a,
    voice: { pitch: 0.75, wave: 'triangle' }, color: '#a8553f',
    model: () => M.makeMushroomFolk(0xc8553f, 1.2),
    house: (lit) => M.makeMushroomHouse(0xc8553f, lit),
    r: 2.1,
    followers: (L, x, z, stage) => {
      const kids = [['chanterelle', 'Chanterelle', 0xd8a04a, 0.75], ['puffball', 'Puffball', 0xf3ead6, 0.55]];
      kids.forEach(([id, name, cap, s], i) => {
        L.npc({ id: 'mr-' + id, name, model: M.makeMushroomFolk(cap, s), x: x + 1 + i * 1.3, z: z + 2.8 + i * 0.4, r: 0.35, blob: 0.6, voice: { pitch: 1.8 + i * 0.4 }, color: '#a8553f', wander: 0.6, speed: 1.4,
          talk: async (D) => {
            if (id === 'chanterelle') await D.say(stage < 2 ? 'Papa says the ground here is the good sort. He\'s had his foot in it all morning.' : 'We\'ve got a round door now. Puffball goes in and out of it to make sure it still works.');
            else await D.say(stage < 2 ? '...i\'m not hiding. i\'m being a mushroom.' : '...it\'s nice here. i only hid twice today. once was by accident.');
          } });
      });
      if (stage === 2) for (let i = 0; i < 10; i++) { const a = i * 0.8, rr = 3 + (i % 3); L.place(M.makeMushroom(L.rng, [0xc8553f, 0xd8a04a, 0xf3ead6][i % 3], 0.8 + (i % 3) * 0.3), x + Math.cos(a) * rr, z + Math.sin(a) * rr); }
    },
    talk: async (D, stage) => {
      if (stage === 0) {
        await D.say('Here, is it. Hm. Hm. Yes, this\'ll do us. There\'s a good damp feel under the turf, and the worms seem like decent sorts.');
        await D.say('Us lot will get a house up. It takes a couple of days with mushrooms, you can\'t hurry a mushroom, they only go faster if you don\'t watch.');
      } else if (stage === 1) {
        await D.say('Coming along. Coming along. Don\'t look straight at it, it\'s shy at this stage, same as Puffball.');
      } else if (!flag('mumbleroots.home')) {
        setFlag('mumbleroots.home');
        await D.say('Well. There it is. A proper house, with a cap on it and a bit of moss on the north side, which is the side moss likes.');
        await D.say('The young ones have stopped asking when we\'re going home. I reckon that\'s because they\'re in it.');
        await D.say('Have these. Spores of ours. They\'re no use to you whatsoever, but it\'s the done thing, giving spores, where we come from.');
        D.lumen(40);
      } else {
        await D.say(['The ground\'s settling nicely. Mushrooms coming up all round now, cousins of ours probably, they turn up when there\'s a house.', 'Chanterelle\'s been teaching Puffball to whistle. Puffball can\'t whistle. Neither can Chanterelle, it turns out.', 'We had a frost in the night and nobody minded. That\'s how you know a place has taken.'][state.day % 3]);
      }
    },
  },
  pockets: {
    tent: 0xd06a5a,
    voice: { pitch: 1.4, wave: 'square' }, color: '#c86a4a',
    model: () => M.makeHermitCrab(),
    house: () => M.makeShellShop(),
    r: 2,
    talk: async (D, stage) => {
      if (stage === 0) {
        await D.say('Lovely spot. Lovely. Between you and me, I can already smell the foot traffic. Give me a day or two to get the shelves up.');
        await D.shop();
      } else if (stage === 1) {
        await D.say('Half a shop is still a shop, friend. Half the prices, no. Full prices. I was testing you.');
        await D.shop();
      } else {
        if (!flag('pockets.home')) { setFlag('pockets.home'); await D.say('Grand opening! You\'re the guest of honour, by which I mean the only guest, which makes you the honour as well. Have a discount.'); state.flags.pocketsDiscount = true; }
        await D.shop();
      }
    },
  },
  bellamy: {
    tent: 0x9a8a6a,
    voice: { pitch: 0.5, wave: 'sine' }, color: '#8a7a4a',
    model: () => M.makeTortoise(),
    house: (lit) => M.makeClockTower(lit),
    r: 1.4,
    talk: async (D, stage) => {
      if (stage === 0) {
        await D.say('This is. Quiet. Thank you. I am going to. Stop here. I have stopped before, of course, but I always had somewhere to be. Now I have here.');
      } else if (stage === 1) {
        await D.say('I am building a tower. With a clock. So that the time. Has somewhere. To be kept. It keeps wandering off, otherwise.');
      } else if (!flag('bellamy.home')) {
        setFlag('bellamy.home');
        await D.say('It is finished. Listen. It ticks. I wound it myself. I have never wound anything before. I have only. Been wound.');
        await D.say('Here. I found this. On the road. In the year. Of the long rain. I have carried it. Since. It seems to want to be yours.');
        D.heart();
      } else {
        await D.say(['The moon came up. Over the tower. Exactly on time. I like to think. I helped.', 'Ummoth used to say. I walked like a slow song. I did not understand. I think I do now.', 'Sit down, if you like. I can tell you about. The year of the long rain. It takes. About a year.'][state.day % 3]);
      }
    },
  },
};
