/**
 * Tutorial guide: shows the original TUTORIAL.TXT's timed on-screen messages
 * and plays Turbo's matching voice line (TUT1..TUT18) as the player rides past
 * each step's track position — recreating the guided original tutorial.
 */

export class TutorialGuide {
  constructor(steps, audio) {
    this.steps = steps || [];
    this.audio = audio;
    this.idx = 0;
    this._hold = 0;

    this.el = document.createElement('div');
    this.el.className = 'tutorial-caption';
    this.el.style.cssText = [
      'position:absolute', 'left:50%', 'top:16%', 'transform:translateX(-50%)',
      'max-width:min(82vw,640px)', 'padding:12px 22px', 'border-radius:16px',
      'background:linear-gradient(180deg,rgba(20,10,40,0.86),rgba(40,20,70,0.86))',
      'border:3px solid #ffd24d', 'color:#fff', 'font-weight:bold',
      'font-size:clamp(15px,2.4vw,22px)', 'text-align:center', 'line-height:1.4',
      'box-shadow:0 6px 20px rgba(0,0,0,0.5)', 'opacity:0',
      'transition:opacity 0.3s ease', 'pointer-events:none', 'z-index:7',
    ].join(';');
    document.getElementById('hud').appendChild(this.el);
  }

  /** Advance based on the player's distance `s`; show due messages. dt seconds. */
  update(s, dt) {
    if (this._hold > 0) this._hold -= dt;
    while (this.idx < this.steps.length && s >= this.steps[this.idx].at) {
      const step = this.steps[this.idx++];
      if (step.voice) this.audio?.voiceFile?.(step.voice);
      if (step.msg) this._show(step.msg, Math.max(3.5, step.dur || 4));
    }
    if (this._hold <= 0 && this.el.style.opacity !== '0') this.el.style.opacity = '0';
  }

  _show(text, holdSec) {
    this.el.textContent = text;
    this.el.style.opacity = '1';
    this._hold = holdSec;
  }

  destroy() { this.el.remove(); }
}
