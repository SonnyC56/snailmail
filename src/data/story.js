/**
 * Original narrative for the homage. Brand-new characters and setting so
 * nothing is lifted from the source game — only the spirit of a plucky
 * mail-carrier snail racing delivery routes.
 *
 * Premise: Pip is a rookie courier at the Cosmic Post, which keeps the
 * scattered worlds of the Spiral Galaxy connected by delivering mail
 * through the ancient "Slipstream" — glowing half-pipe mail-tubes that
 * arc between planets. The grumpy Slug Syndicate wants to replace heartfelt
 * letters with instant nothing-grams and shut snail mail down for good.
 * Pip has to earn every stamp on the route and prove the slow way still
 * delivers.
 */

export const CHARACTERS = {
  pip: { name: 'Pip', role: 'Rookie Courier', color: '#3fbfb0' },
  postmaster: { name: 'Postmaster Wobble', role: 'Cosmic Post', color: '#ff8c1a' },
  slug: { name: 'Director Sludge', role: 'Slug Syndicate', color: '#9a4ecf' },
};

/**
 * Interludes keyed by `worldId:position` where position is 'intro' (before
 * the world's first level) or 'outro' (after its last). Each is a short
 * card sequence. `art` selects a procedural backdrop in the story screen.
 */
export const STORY = {
  intro: [
    { speaker: 'Postmaster Wobble', art: 'post-office',
      text: "Welcome to the Cosmic Post, Pip! Every letter in the Spiral Galaxy travels the Slipstream — and today you ride it for the first time." },
    { speaker: 'Postmaster Wobble', art: 'post-office',
      text: "Scoop up every letter, dodge the slugs, and don't fall off the tube. Deliver them all and you'll earn your first stamp. Off you go!" },
  ],

  'meadow:outro': [
    { speaker: 'Pip', art: 'meadow',
      text: "First route, done! That was actually kind of... fun? The wind in my eyestalks, the letters in the bag —" },
    { speaker: 'Director Sludge', art: 'syndicate',
      text: "Enjoy it while it lasts, snail. Nobody waits for SLOW mail anymore. The Slug Syndicate delivers nothing-grams INSTANTLY. Soon your little tubes will be SCRAP." },
  ],

  'desert:intro': [
    { speaker: 'Postmaster Wobble', art: 'post-office',
      text: "Sludge cut the Dune World route to strand them! Folks out there are waiting on letters from home. Get the mail through, Pip." },
  ],
  'desert:outro': [
    { speaker: 'Pip', art: 'desert',
      text: "Sand in my shell, but every letter delivered. The dune folk waved the whole way down the tube." },
  ],

  'ice:intro': [
    { speaker: 'Postmaster Wobble', art: 'post-office',
      text: "Glacier World's slipstream is iced over and the Syndicate salted the rails. Careful — salt is the one thing a snail can't touch. Stay sharp." },
  ],
  'ice:outro': [
    { speaker: 'Director Sludge', art: 'syndicate',
      text: "You slid past the SALT? Impressive, for a creature that moves at the speed of MOSS. It won't matter. I've reached the Ember relay first." },
  ],

  'volcano:intro': [
    { speaker: 'Postmaster Wobble', art: 'post-office',
      text: "The Ember World relay is the heart of the whole network. If Sludge shuts it down, the Slipstream goes dark forever. This is the big one, Pip." },
  ],
  'volcano:outro': [
    { speaker: 'Pip', art: 'volcano',
      text: "Relay's lit and humming! Letters pouring through to every world. But Sludge... he bolted for the old Nebula tube. The original line." },
  ],

  'cosmic:intro': [
    { speaker: 'Postmaster Wobble', art: 'post-office',
      text: "The Nebula Line is where the Cosmic Post began — the very first letter ever mailed still rides it. Sludge means to unravel it. Deliver, Pip. For all of us." },
  ],
  'cosmic:outro': [
    { speaker: 'Director Sludge', art: 'syndicate',
      text: "Impossible. You delivered EVERY letter, on the oldest, longest, most broken tube in the galaxy. Even mine. ...You delivered MINE?" },
    { speaker: 'Pip', art: 'cosmic',
      text: "Addressed to a slug who forgot what it's like to get one. No charge. Welcome back to the mail, Director." },
    { speaker: 'Postmaster Wobble', art: 'post-office',
      text: "The Slipstream's brighter than it's been in a century. You didn't just save snail mail, Pip — you reminded the whole galaxy why slow is worth the wait. Stamp earned, Courier First Class." },
  ],

  victory: [
    { speaker: 'The Cosmic Post', art: 'cosmic',
      text: "And so the letters kept flowing — slow, sure, and full of heart — across every world in the Spiral Galaxy.\n\nThanks for riding the Slipstream." },
  ],
};

// Generic per-galaxy beats so every galaxy gets a short interlude even as the
// galaxy count is data-driven. Special galaxies layer authored lines on top.
const GALAXY_INTRO = [
  { speaker: 'Postmaster Wobble', art: 'post-office', text: "New galaxy, new route. The Slipstream's a little rougher out here, Pip — keep that bag full and your eyestalks up." },
  { speaker: 'Pip', art: 'cosmic', text: "Another stack of letters, another stretch of tube. Folks are counting on us. Let's deliver." },
  { speaker: 'Director Sludge', art: 'syndicate', text: "Still crawling along, snail? My nothing-grams already arrived. Yesterday. Give up." },
];
const GALAXY_OUTRO = [
  { speaker: 'Pip', art: 'meadow', text: "Route cleared, every parcel home. On to the next galaxy!" },
  { speaker: 'Postmaster Wobble', art: 'post-office', text: "Beautiful work, Courier. The Slipstream's glowing a little brighter on the map. Keep going." },
];

/**
 * Story cards for a galaxy transition.
 * @param galaxyIndex   0-based galaxy
 * @param total         total galaxy count
 * @param position      'intro' | 'outro'
 */
export function storyFor(galaxyIndex, total, position) {
  if (position === 'intro') {
    if (galaxyIndex === 0) return STORY.intro;
    return [GALAXY_INTRO[galaxyIndex % GALAXY_INTRO.length]];
  }
  // outro
  if (galaxyIndex >= total - 1) return STORY.victory;
  const beat = [GALAXY_OUTRO[galaxyIndex % GALAXY_OUTRO.length]];
  if (galaxyIndex % 2 === 1) beat.push(GALAXY_INTRO[2]); // occasional villain taunt
  return beat;
}
