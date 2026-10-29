// How the people who give quests talk (docs/quests.md, "Voices"). Pure. Each villager has a voice
// of their own, and the people out in the world one by their role (core/npcs.js ROLES): a few
// words to begin a quest's story with (hello) or end it (bye), what they say when it is handed in
// (thanks), and what they say when you come to talk (ask: they have an offer; back: one to hand
// in; waiting: one going on; idle: nothing for you). Words to say later (src/i18n/i18n.js msg):
// a quest keeps them as words, so it reads in any language.
import { msg, phrase } from '../i18n/i18n.js';
import { mulberry32, hash32 } from './util.js';
import { hashString } from './gear/drops.js';

export const VOICES = {
  innkeeper: {
    hello: [msg('Sit down, take a stool.'), msg('Oh, it is you! Just the one I wanted to see.'), msg('Psst. Lean in, I have heard something.')],
    bye: [msg('There is a warm bowl of soup in it for you.'), msg('And not a word to the groom. He gossips.')],
    thanks: [msg('Ha! I knew you would do it. The soup is on the house tonight.'), msg('Wonderful! Wait until the others hear about this.')],
    ask: msg('Sit down a moment, I have a favour to ask.'),
    back: msg('Back already? Tell me everything!'),
    waiting: msg('Still out there on that errand of mine? The soup will keep.'),
    idle: msg('Nothing new today. Come back when you have been further down; travellers bring stories.'),
  },
  groom: {
    hello: [msg('Easy, easy... Oh, sorry, I was talking to the horse.'), msg('Hello! Mind the hooves.'), msg('The horses like you. I can tell by their ears.')],
    bye: [msg('The horses and I will be waiting.'), msg('Take a carrot for the road. No? More for the horses, then.')],
    thanks: [msg('You did it! Even the old mare looks impressed.'), msg('Thank you! I would give you a horse, but they would miss me.')],
    ask: msg('Could you help me? The horses cannot, they have no hands.'),
    back: msg('You are back! The horses heard you coming.'),
    waiting: msg('No hurry. Well, a little hurry.'),
    idle: msg('Nothing for you just now. I have six horses to brush.'),
  },
  smith: {
    hello: [msg('Hm. Strong arms. Good.'), msg('Stand back from the sparks.'), msg('Clang! Sorry. What? Oh. Listen.')],
    bye: [msg('Do not come back dented.'), msg('Go on, then. The iron will not wait.')],
    thanks: [msg('Hm. Good work. Solid.'), msg('Not bad. Not bad at all. Here.')],
    ask: msg('Got a job for you. Hard work, fair pay.'),
    back: msg('Back. Done?'),
    waiting: msg('Still working on it? So am I.'),
    idle: msg('Nothing. Go deeper, then ask again.'),
  },
  keeper: {
    hello: [msg('Shh, the rabbits are sleeping.'), msg('Hello! Careful, the ferret bites. Only a little.'), msg('Oh! You look like somebody animals trust.')],
    bye: [msg('The bunnies send their best wishes.'), msg('Be kind to anything small and fluffy down there. Unless it bites.')],
    thanks: [msg('Oh, thank you! The rabbits are doing a happy dance.'), msg('You are wonderful. The ferret thinks so too, he just will not say.')],
    ask: msg('Could you help? It is important. Well, the rabbits think so.'),
    back: msg('You are back! Quick, before the ferret gets out!'),
    waiting: msg('How is it going? The rabbits keep asking.'),
    idle: msg('Nothing today. Feeding time!'),
  },
  alchemist: {
    hello: [msg('Do not touch the green one. Or the blue one. Now, listen.'), msg('Sniff. Do you smell burnt sugar? Never mind.'),
      msg('Ah, perfect timing. My cauldron just stopped smoking.')],
    bye: [msg('If you meet anything that glows, do not lick it.'), msg('Try not to come back a different colour.')],
    thanks: [msg('Marvellous! That deserves a fizzy drink.'), msg('Splendid! I will name a potion after you. A nice one.')],
    ask: msg('I need a pair of brave hands. Mine are sticky.'),
    back: msg('Back in one piece! And the right colour!'),
    waiting: msg('Still at it? Good. So is my cauldron.'),
    idle: msg('Nothing for you just now, unless you want to taste something.'),
  },
  enchanter: {
    hello: [msg('The stars whispered you would come.'), msg('Hush. The crystal ball is cloudy today, but I see you clearly.'),
      msg('Ah. Your shadow has a lovely shape.')],
    bye: [msg('May the glass keep you.'), msg('Walk softly. The deep has ears.')],
    thanks: [msg('Just as the crystal ball said. Well, nearly.'), msg('The stars are pleased. So am I.')],
    ask: msg('The crystal ball showed me a task, and then it showed me you.'),
    back: msg('I saw you coming. In the ball, and also through the gate.'),
    waiting: msg('The ball says you are not done yet. The ball is always right.'),
    idle: msg('The ball is quiet. Come back when you have been deeper.'),
  },
  hermit: {
    hello: [msg('Hm? Oh. A visitor. It has been years.'), msg('Sit, sit. My knees do not like company, but I do.'),
      msg('Shh. Listen to the quiet... Right. Now then.')],
    bye: [msg('I will be here. I am always here.'), msg('Go slowly. Slow is how one gets old.')],
    thanks: [msg('Well, well. You came back. Most do not.'), msg('Thank you. Here, take this; I have no use for it.')],
    ask: msg('You look like you have time. I have a little task.'),
    back: msg('Back? Already? Or was it a year?'),
    waiting: msg('No hurry. I have waited this long.'),
    idle: msg('Nothing. Sit a while, if you like.'),
  },
  explorer: {
    hello: [msg('Ah, a fellow adventurer!'), msg('You there! Do you like maps? I love maps.'),
      msg('Hello! I have a blister, so you will have to go instead.')],
    bye: [msg('Remember everything! I want every detail.'), msg('Adventure awaits! Mine waits for my blister.')],
    thanks: [msg('Splendid! That goes in my journal, with a drawing.'), msg('Ha! I knew you had the boots for it.')],
    ask: msg('I have an expedition for you. A small one. Well, not that small.'),
    back: msg('You are back! Tell me everything!'),
    waiting: msg('Still exploring? Good. Do not rush the best bits.'),
    idle: msg('Nothing right now. My map has a hole where the deeper parts go.'),
  },
  miner: {
    hello: [msg('Watch your head, the roof is low.'), msg('Ho there! Mind the tracks.'), msg('Dusty down here, eh? You get used to it.')],
    bye: [msg('Keep your lamp lit.'), msg('If the rocks start singing, run.')],
    thanks: [msg('Ha! Good as gold, you are.'), msg('Much obliged. Here, I dug this up for you.')],
    ask: msg('A job for you, if you are not afraid of the dark.'),
    back: msg('Back from the deep! Well?'),
    waiting: msg('Still digging? Me too.'),
    idle: msg('Nothing today. Only rocks, and more rocks.'),
  },
  pilgrim: {
    hello: [msg('Peace be with you.'), msg('May your road be gentle. Mine was not, which is why I need you.'), msg('I was praying for help, and here you are.')],
    bye: [msg('I will light a lamp for you.'), msg('Go safely, and come back safely.')],
    thanks: [msg('My prayers were heard! Thank you.'), msg('Bless you, and bless your boots.')],
    ask: msg('Would you help me? My feet are tired from the road.'),
    back: msg('You have come back! I lit a lamp for you.'),
    waiting: msg('Patience is a kind of prayer. I am praying a lot.'),
    idle: msg('Nothing today. Rest here a moment, the lamps are warm.'),
  },
  trapper: {
    hello: [msg('Quiet now, you will scare off the game.'), msg('Careful where you step. Snares.'), msg('Hm, fresh tracks. Yours, I think.')],
    bye: [msg('Stay downwind of anything big.'), msg('Follow the tracks, not the noise.')],
    thanks: [msg('Good hunting! You have earned this.'), msg('Clean work. I could not have done better. Well, a little.')],
    ask: msg('I have a job, if you can walk quietly.'),
    back: msg('Back. I heard you a mile off.'),
    waiting: msg('Patience. The best catches take time.'),
    idle: msg('Nothing today. The snares are empty, and so is my list.'),
  },
  scholar: {
    hello: [msg('Ah, excellent, a field assistant.'), msg('Fascinating! Oh, I meant the moss, not you. Well, both.'),
      msg('Have you read my book? No? Nobody has.')],
    bye: [msg('Take notes. Neat ones, please.'), msg('Science thanks you. And so do I.')],
    thanks: [msg('Remarkable! This will be a footnote. A long one.'), msg('Excellent work. I shall mention you in chapter nine.')],
    ask: msg('I have a question only legs can answer. Yours, preferably.'),
    back: msg('Back! Results, please.'),
    waiting: msg('Still collecting data? Take your time. Accuracy matters.'),
    idle: msg('Nothing for now. I am still reading.'),
  },
  carter: {
    hello: [msg('Whoa! Oh, sorry, I thought you were a monster.'), msg('Hello, hello! Mind the wheels.'),
      msg('Business is slow down here. Help is welcome.')],
    bye: [msg('I will keep the cart steady.'), msg('Safe roads to you.')],
    thanks: [msg('Much obliged! Here, straight off the cart.'), msg('You saved my skin. And my flour, and my cider.')],
    ask: msg('I have work for you, paid in coin.'),
    back: msg('There you are! How did it go?'),
    waiting: msg('Still out there? The cart and I are not going anywhere.'),
    idle: msg('Nothing right now. Want to buy a wheel? No? Fair.'),
  },
};
// what found people say when you come to them (game/quests.js rescue)
export const FOUND_SAYS = [msg('{name}: Thank you! I will go back now. Here, take this.'),
  msg('{name}: You found me! I was so scared. I will go straight back. Here, take this.'),
  msg('{name}: Is it safe? With you here, it is. I will go home now. Take this, please.'),
  msg('{name}: Finally! My feet hurt and I am hungry. Thank you! Here, for you.')];

const pickOf = (R, xs) => xs[Math.floor(R() * xs.length)];

// A quest's story as told by `voice` (a villager's name or a role): the story alone, or with a
// hello before it, a bye after it, or both (from R, the quest's random numbers)
export function dressed(R, voice, body) {
  const v = VOICES[voice], r = R();
  if (!v) return body;
  if (r < 0.35) return phrase('{hello} {body}', { hello: phrase(pickOf(R, v.hello)), body });
  if (r < 0.6) return phrase('{body} {bye}', { body, bye: phrase(pickOf(R, v.bye)) });
  if (r < 0.8) return phrase('{hello} {body} {bye}', { hello: phrase(pickOf(R, v.hello)), body, bye: phrase(pickOf(R, v.bye)) });
  return body;
}
// what `voice` says when a quest is handed in (words; null: nobody with a voice)
export const thanksOf = (R, voice) => VOICES[voice] ? phrase(pickOf(R, VOICES[voice].thanks)) : null;

// A line of a kind's, as `voice` would say it: a line is a message (anybody says it) or
// { t, voices } (only those say it, and likelier than the rest). As words, with the parameters w.
export function told(R, voice, lines, w) {
  const can = lines.filter(l => typeof l === 'string' || l.voices.includes(voice));
  const weight = l => typeof l === 'string' ? 1 : 3;
  let r = R() * can.reduce((n, l) => n + weight(l), 0), line = can.at(-1);
  for (const l of can) if ((r -= weight(l)) < 0) { line = l; break; }
  return phrase(typeof line === 'string' ? line : line.t, w);
}

// what `voice` says when you come to talk (`what`: ask, back, waiting, idle): the message, or
// null (no voice)
export const greeting = (voice, what) => VOICES[voice]?.[what] ?? null;
// what somebody found says (a message of FOUND_SAYS, by the quest's id)
export const foundSays = id => FOUND_SAYS[mulberry32(hash32(hashString(String(id)) ^ 0x5a75))() * FOUND_SAYS.length | 0];
