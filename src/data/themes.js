/**
 * World themes: palette + environment + music for each world.
 * Original palettes; tuned to evoke a bright 2004 casual-game vibe.
 */

// original space backdrop (BACKGROUNDS/<NAME>) → theme key
const BG_THEME = {
  SpacePurple: 'cosmic',
  SpaceRed: 'volcano',
  SpaceBlueswhorl: 'ice',
  SpaceGreenwarp: 'meadow',
};
export function themeForBackground(bg) { return BG_THEME[bg] || 'cosmic'; }

export const THEMES = {
  meadow: {
    name: 'Meadow World',
    song: 'meadow',
    background: 'SPACEGREENWARP',
    trackTex: 'OBJECTS/WORLD00/TRACK0',
    slideTex: 'OBJECTS/WORLD00/SLIDE0',
    distort: 5,            // original SPACEGREENWARP.TXT Distort:5.0
    musicWorld: 0,
    skyTop: 0x3a7bd5,
    skyBottom: 0xbfe8ff,
    fogColor: 0xa8d8f0,
    surface: 0x76c34a,      // grassy green track
    surfaceEdge: 0x4a8c2e,
    stripe: 0xfff1c9,
    rail: 0xffd24d,
    lightSky: 0xffffff,
    lightGround: 0x6a9a50,
    sunColor: 0xfff2d9,
    starOpacity: 0.25,
    planets: [
      { size: 26, color: 0xffd24d, pos: [220, 160, -420], swirl: 0xffb340 },
      { size: 14, color: 0x7fc6ff, pos: [-300, 90, -380] },
    ],
    props: [
      { kind: 'mushroom', color: 0xe04040 },
      { kind: 'mushroom', color: 0xff8c1a },
      { kind: 'ringlet', color: 0x76c34a },
    ],
    dotColor: '#76c34a',
  },

  desert: {
    name: 'Dune World',
    song: 'desert',
    background: 'SPACERED',
    trackTex: 'OBJECTS/WORLD00/TRACK2',
    slideTex: 'OBJECTS/WORLD00/SLIDE2',
    distort: 10,           // original SPACERED.TXT Distort:10.0
    musicWorld: 2,
    skyTop: 0xc4581f,
    skyBottom: 0xffd9a0,
    fogColor: 0xf0c896,
    surface: 0xe8b05c,
    surfaceEdge: 0xb87a30,
    stripe: 0x8c4a1f,
    rail: 0xe04040,
    lightSky: 0xfff4e0,
    lightGround: 0xa07040,
    sunColor: 0xffe0b0,
    starOpacity: 0.35,
    planets: [
      { size: 30, color: 0xff8c5a, pos: [-260, 140, -400], ring: 0xffd24d },
      { size: 10, color: 0xd96d00, pos: [320, 200, -350] },
    ],
    props: [
      { kind: 'cactus', color: 0x4a8c2e },
      { kind: 'asteroid', color: 0xc8915a },
    ],
    dotColor: '#e8b05c',
  },

  ice: {
    name: 'Glacier World',
    song: 'ice',
    background: 'SPACEBLUESWHORL',
    trackTex: 'OBJECTS/WORLD00/TRACK1',
    slideTex: 'OBJECTS/WORLD00/SLIDE1',
    distort: 10,           // original SPACEBLUESWHORL.TXT Distort:10.0
    musicWorld: 1,
    skyTop: 0x1a2a6e,
    skyBottom: 0x9fd4e8,
    fogColor: 0xa0c8e0,
    surface: 0xb8e4f0,
    surfaceEdge: 0x5a9ec4,
    stripe: 0x2a5a8c,
    rail: 0x66ccff,
    lightSky: 0xeaf6ff,
    lightGround: 0x5a7a9a,
    sunColor: 0xd0e8ff,
    starOpacity: 0.7,
    planets: [
      { size: 24, color: 0x9fd4ff, pos: [240, 180, -380], ring: 0xffffff },
      { size: 12, color: 0x6688ee, pos: [-280, 120, -420] },
    ],
    props: [
      { kind: 'crystal', color: 0x9fe0ff },
      { kind: 'asteroid', color: 0xc8e0f0 },
    ],
    dotColor: '#b8e4f0',
  },

  volcano: {
    name: 'Ember World',
    song: 'volcano',
    background: 'SPACERED',
    trackTex: 'OBJECTS/WORLD00/TRACK3',
    slideTex: 'OBJECTS/WORLD00/SLIDE3',
    distort: 10,           // the 4th original road skin; SPACERED Distort:10.0
    musicWorld: 2,
    skyTop: 0x2a0a14,
    skyBottom: 0xb83a1a,
    fogColor: 0x8c3018,
    surface: 0x6a4a4a,
    surfaceEdge: 0x3a2424,
    stripe: 0xff8c1a,
    rail: 0xff5a1a,
    lightSky: 0xffd0b0,
    lightGround: 0x802a10,
    sunColor: 0xff9a60,
    starOpacity: 0.5,
    planets: [
      { size: 28, color: 0xff5a1a, pos: [200, 150, -400], swirl: 0xffb340 },
      { size: 11, color: 0x8c2a10, pos: [-340, 100, -360] },
    ],
    props: [
      { kind: 'lavarock', color: 0x4a3030 },
      { kind: 'asteroid', color: 0x6a4a4a },
    ],
    dotColor: '#ff5a1a',
  },

  cosmic: {
    name: 'Nebula World',
    song: 'cosmic',
    background: 'SPACEPURPLE',
    trackTex: 'OBJECTS/WORLD00/TRACK0',
    slideTex: 'OBJECTS/WORLD00/SLIDE0',
    distort: 20,           // original SPACEPURPLE.TXT Distort:20.0
    musicWorld: 3,
    skyTop: 0x12041e,
    skyBottom: 0x4a1a6e,
    fogColor: 0x3a1454,
    surface: 0x8a5ad0,
    surfaceEdge: 0x4a2a80,
    stripe: 0xffd24d,
    rail: 0xff66cc,
    lightSky: 0xe0d0ff,
    lightGround: 0x504080,
    sunColor: 0xd0b0ff,
    starOpacity: 1.0,
    planets: [
      { size: 34, color: 0xff66cc, pos: [260, 200, -420], ring: 0x66ccff },
      { size: 16, color: 0x66ccff, pos: [-300, 140, -380], swirl: 0xffffff },
      { size: 9, color: 0xffd24d, pos: [80, 260, -460] },
    ],
    props: [
      { kind: 'ringlet', color: 0xff66cc },
      { kind: 'asteroid', color: 0x8a5ad0 },
      { kind: 'crystal', color: 0xcc88ff },
    ],
    dotColor: '#8a5ad0',
  },
};
