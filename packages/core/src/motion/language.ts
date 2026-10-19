import { bezier } from "../scales.js";
import type { DesignSystem } from "../system.js";

/**
 * The motion language for brand animations, derived from the system's motion
 * profile. Product UI moves in 120 to 300ms; a launch video or a social post
 * moves slower and further, but with the same easing and the same character:
 * a still system only fades, a subtle one rises a little, an expressive one
 * springs.
 */
export interface MotionLanguage {
  profile: DesignSystem["motion"]["name"];
  /** How long an entrance takes, in ms. */
  beat: number;
  /** Delay between items arriving in sequence, in ms. */
  stagger: number;
  /** Pause after a scene settles, before the next one or the loop, in ms. */
  hold: number;
  /** Crossfade between scenes in a sequence, in ms. */
  crossfade: number;
  ease: string;
  easeInOut: string;
  /** A spring as a CSS linear() curve for expressive systems; the ease for the rest. */
  spring: string;
  /** Distance entering elements travel, in stage units (1 unit is 1% of the stage's short side). */
  travel: number;
  /** Scale entering elements start from. */
  scaleFrom: number;
  /** Scale popping elements (marks, buttons) start from. */
  popFrom: number;
  /** Whether loops (spinners, typing dots) move. */
  ambient: boolean;
}

/** A damped spring's step response as a CSS linear() curve, settling by the end. */
export function springCurve(bounce: number, points = 36): string {
  const zeta = Math.max(0.2, 1 - bounce * 2.2);
  const w = Math.log(400) / zeta;
  const wd = w * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta));
  const out: string[] = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const x = zeta >= 1 ? 1 - (1 + w * t) * Math.exp(-w * t) : 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
    out.push((i === points ? 1 : Math.round(x * 1000) / 1000).toString());
  }
  return `linear(${out.join(", ")})`;
}

export function motionLanguage(s: DesignSystem): MotionLanguage {
  const m = s.motion;
  const ease = bezier(m.easing.out);
  const base = {
    profile: m.name,
    ease,
    easeInOut: bezier(m.easing.inOut),
    ambient: m.ambient,
  };
  switch (m.name) {
    case "still":
      return { ...base, beat: 560, stagger: 140, hold: 1400, crossfade: 500, spring: ease, travel: 0, scaleFrom: 1, popFrom: 1 };
    case "expressive":
      return {
        ...base,
        beat: 820,
        stagger: 150,
        hold: 1200,
        crossfade: 420,
        spring: m.spring && m.spring.bounce > 0 ? springCurve(m.spring.bounce) : ease,
        travel: 4.5,
        scaleFrom: 0.94,
        popFrom: 0.8,
      };
    default:
      return { ...base, beat: 700, stagger: 120, hold: 1300, crossfade: 460, spring: ease, travel: 2.2, scaleFrom: 0.97, popFrom: 0.92 };
  }
}
