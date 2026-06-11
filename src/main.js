/**
 * Bootstrap: wire renderer, input, audio and the Game controller together.
 */

import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { AudioEngine } from './engine/audio.js';
import { save } from './save.js';
import { Game } from './game/game.js';

const canvas = document.getElementById('game-canvas');
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const audio = new AudioEngine();

const ctx = {
  scene: renderer.scene,
  camera: renderer.camera,
  renderer,
  input,
  audio,
  save,
};

const game = new Game(ctx);

// audio needs a user gesture to start
const unlock = () => { audio.unlock(); };
window.addEventListener('pointerdown', unlock, { once: false });
window.addEventListener('keydown', unlock, { once: false });

renderer.onUpdate((dt) => game.update(dt));
renderer.onFrame((alpha, elapsed) => {
  game.frame(alpha, elapsed);
  input.endFrame();
});

renderer.start();
game.start();

// expose for debugging / console tweaks
window.__snail = { game, renderer, audio, input };
