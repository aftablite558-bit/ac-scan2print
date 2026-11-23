import gsap from 'gsap';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);

export { gsap, Flip };

export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const finePointer = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export const dur = (sec: number): number => (reducedMotion() ? 0 : sec);

/**
 * Computes an inset clip-path string for iris/curtain reveal animations.
 */
export function clipInset(el: HTMLElement | null, t: number, bleed = 0): string {
  if (!el || !el.isConnected) return 'inset(0px 0px 0px 0px round 22px)';
  try {
    const w = el.offsetWidth || 320;
    const h = el.offsetHeight || 160;
    const cs = getComputedStyle(el);
    const r = parseFloat(cs.borderTopLeftRadius) || 22;
    const s = Math.max(0, (w / 2) * t - bleed);
    const c = Math.max(0, (h / 2) * t - bleed);
    const b = Math.max(0, -bleed);
    return t === 0
      ? `inset(${b}px ${b}px ${b}px ${b}px round ${r}px)`
      : `inset(${c.toFixed(1)}px ${s.toFixed(1)}px ${c.toFixed(1)}px ${s.toFixed(1)}px round ${r}px)`;
  } catch {
    return 'inset(0px 0px 0px 0px round 22px)';
  }
}

/**
 * Splits a heading element's text into `.word > .ch` spans and animates characters in.
 */
export function revealText(el: HTMLElement | null, delay = 0): gsap.core.Tween | null {
  if (!el || !el.isConnected) return null;
  if (reducedMotion()) return null;

  const raw = el.dataset.origText ?? el.textContent ?? '';
  if (!raw.trim()) return null;
  el.dataset.origText = raw;

  try {
    const words = raw.trim().split(/(\s+)/);
    el.textContent = '';

    const chars: HTMLSpanElement[] = [];
    for (const part of words) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        el.appendChild(document.createTextNode(part));
        continue;
      }
      const wordSpan = document.createElement('span');
      wordSpan.className = 'word';
      for (const ch of Array.from(part)) {
        const chSpan = document.createElement('span');
        chSpan.className = 'ch';
        chSpan.textContent = ch;
        wordSpan.appendChild(chSpan);
        chars.push(chSpan);
      }
      el.appendChild(wordSpan);
    }

    if (!chars.length) {
      el.textContent = raw;
      return null;
    }

    return gsap.fromTo(
      chars,
      { yPercent: 105, rotation: 4 },
      {
        yPercent: 0,
        rotation: 0,
        duration: dur(0.55),
        ease: 'power4.out',
        stagger: dur(0.012),
        delay: dur(delay),
        clearProps: 'transform',
        onComplete: () => {
          el.querySelectorAll<HTMLElement>('.word').forEach((w) => {
            w.style.overflow = 'visible';
          });
        },
      }
    );
  } catch {
    el.textContent = raw;
    return null;
  }
}

/**
 * Iris clip-path + vertical lift + inner children fade reveal for card elements.
 */
export function revealCards(
  els: (HTMLElement | null)[] | NodeListOf<HTMLElement> | HTMLElement | null,
  opts: { y?: number; stagger?: number; delay?: number; from?: number } = {}
): gsap.core.Timeline | null {
  if (!els) return null;
  const list = (
    els instanceof HTMLElement
      ? [els]
      : Array.from(els as HTMLElement[])
  ).filter((el): el is HTMLElement => Boolean(el && el.isConnected));

  if (!list.length || reducedMotion()) return null;

  try {
    const { y = 20, stagger = 0.035, delay = 0, from = 0.45 } = opts;
    const tl = gsap.timeline({ delay: dur(delay) });

    list.forEach((el, idx) => {
      const startAt = idx * Math.min(stagger, 0.04);
      tl.fromTo(
        el,
        { y, scale: 0.98, clipPath: clipInset(el, from) },
        {
          y: 0,
          scale: 1,
          clipPath: clipInset(el, 0, 60),
          duration: 0.48,
          ease: 'expo.out',
          clearProps: 'transform,clipPath',
        },
        startAt
      );

      const children = Array.from(el.children).filter(
        (ch): ch is HTMLElement =>
          ch instanceof HTMLElement &&
          !ch.classList.contains('nofade') &&
          getComputedStyle(ch).position !== 'absolute'
      );
      if (children.length) {
        tl.fromTo(
          children,
          { opacity: 0, y: 6 },
          {
            opacity: 1,
            y: 0,
            duration: 0.32,
            ease: 'power3.out',
            stagger: 0.02,
            clearProps: 'transform,opacity',
          },
          startAt + 0.06
        );
      }
    });

    return tl;
  } catch {
    list.forEach((el) => {
      el.style.opacity = '1';
      el.style.clipPath = '';
      el.style.transform = '';
    });
    return null;
  }
}

/**
 * Iris clip-path exit choreography for cards / panels.
 */
export function exitCards(
  els: (HTMLElement | null)[],
  onDone?: () => void,
  opts: { duration?: number } = {}
): void {
  const list = els.filter((el): el is HTMLElement => Boolean(el));
  if (!list.length || reducedMotion()) {
    onDone?.();
    return;
  }
  const { duration = 0.18 } = opts;
  const tl = gsap.timeline({ onComplete: onDone });
  list.forEach((el) => {
    const children = Array.from(el.children).filter(
      (ch): ch is HTMLElement =>
        ch instanceof HTMLElement && getComputedStyle(ch).position !== 'absolute'
    );
    if (children.length) {
      tl.to(children, { opacity: 0, duration: duration * 0.6, ease: 'power1.in' }, 0);
    }
    tl.fromTo(
      el,
      { clipPath: clipInset(el, 0, 60) },
      {
        clipPath: clipInset(el, 0.96),
        scale: 0.975,
        y: 6,
        duration,
        ease: 'power2.in',
      },
      0
    );
  });
}

/**
 * Staggered row entrance.
 */
export function revealRows(
  els: (HTMLElement | null)[] | NodeListOf<HTMLElement> | null,
  opts: { x?: number; y?: number; stagger?: number; delay?: number } = {}
): gsap.core.Tween | null {
  if (!els) return null;
  const list = Array.from(els as HTMLElement[]).filter((el) => Boolean(el && el.isConnected));
  if (!list.length || reducedMotion()) return null;
  try {
    const { x = 0, y = 12, stagger = 0.04, delay = 0 } = opts;
    return gsap.fromTo(
      list,
      { opacity: 0, x, y },
      {
        opacity: 1,
        x: 0,
        y: 0,
        duration: dur(0.55),
        ease: 'power3.out',
        stagger: dur(stagger),
        delay: dur(delay),
        clearProps: 'transform,opacity',
      }
    );
  } catch {
    return null;
  }
}

/**
 * Tilted iris card grid entrance (Shorts, Playlists, Shop products, Membership tiers).
 */
export function revealTiltCards(
  els: (HTMLElement | null)[] | NodeListOf<HTMLElement> | null,
  opts: { delay?: number; stagger?: number } = {}
): gsap.core.Tween | null {
  if (!els) return null;
  const list = Array.from(els as HTMLElement[]).filter((el) => Boolean(el && el.isConnected));
  if (!list.length || reducedMotion()) return null;
  try {
    const { delay = 0, stagger = 0.07 } = opts;
    return gsap.fromTo(
      list,
      {
        clipPath: (_i: number, el: HTMLElement) => clipInset(el, 0.6),
        y: 40,
        rotation: (i: number) => (i % 2 ? 2.5 : -2.5),
        scale: 0.95,
      },
      {
        clipPath: (_i: number, el: HTMLElement) => clipInset(el, 0, 60),
        y: 0,
        rotation: 0,
        scale: 1,
        duration: dur(0.85),
        ease: 'back.out(1.4)',
        stagger: dur(stagger),
        delay: dur(delay),
        clearProps: 'transform,clipPath',
      }
    );
  } catch {
    return null;
  }
}

/**
 * Scales horizontal or vertical progress bars / bars from 0 to 1.
 */
export function scaleAxes(
  els: (HTMLElement | null)[] | NodeListOf<HTMLElement> | null,
  opts: { axis?: 'x' | 'y'; delay?: number; stagger?: number; duration?: number } = {}
): gsap.core.Tween | null {
  if (!els) return null;
  const list = Array.from(els as HTMLElement[]).filter((el) => Boolean(el && el.isConnected));
  if (!list.length || reducedMotion()) return null;
  try {
    const { axis = 'y', delay = 0, stagger = 0.03, duration = 0.9 } = opts;
    const prop = axis === 'x' ? 'scaleX' : 'scaleY';
    const origin = axis === 'x' ? 'left center' : 'bottom center';
    return gsap.fromTo(
      list,
      { [prop]: 0, transformOrigin: origin },
      {
        [prop]: 1,
        duration: dur(duration),
        ease: 'expo.out',
        stagger: dur(stagger),
        delay: dur(delay),
        clearProps: 'transform',
      }
    );
  } catch {
    return null;
  }
}

/**
 * Elastic spring pop for count badges and pills.
 */
export function popBadges(
  els: (HTMLElement | null)[] | NodeListOf<HTMLElement> | null,
  opts: { from?: number; delay?: number; stagger?: number } = {}
): gsap.core.Tween | null {
  if (!els) return null;
  const list = Array.from(els as HTMLElement[]).filter((el) => Boolean(el && el.isConnected));
  if (!list.length || reducedMotion()) return null;
  try {
    const { from = 0.6, delay = 0, stagger = 0.05 } = opts;
    return gsap.fromTo(
      list,
      { scale: from, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: dur(0.6),
        ease: 'back.out(3)',
        stagger: dur(stagger),
        delay: dur(delay),
        clearProps: 'transform,opacity',
      }
    );
  } catch {
    return null;
  }
}

/**
 * Accent flash + micro bump when a numeric readout updates live or via stock action.
 */
export function flashBump(el: HTMLElement | null): void {
  if (!el) return;
  el.classList.remove('is-flash');
  void el.offsetWidth;
  el.classList.add('is-flash');
  if (reducedMotion()) return;
  gsap.fromTo(
    el,
    { y: -4, scale: 1.08 },
    { y: 0, scale: 1, duration: 0.55, ease: 'back.out(2.4)', clearProps: 'transform' }
  );
}

/**
 * Floating `+1` / `+12` pill rising cleanly from an interactive button.
 */
export function floatGain(
  anchorEl: HTMLElement | null,
  text: string,
  tone: 'good' | 'accent' = 'good'
): void {
  if (!anchorEl || reducedMotion()) return;
  const rect = anchorEl.getBoundingClientRect();
  const badge = document.createElement('span');
  badge.className = `float-gain float-gain--${tone}`;
  badge.textContent = text;
  badge.style.left = `${rect.left + rect.width / 2}px`;
  badge.style.top = `${rect.top + 2}px`;
  document.body.appendChild(badge);

  gsap.fromTo(
    badge,
    { opacity: 0, y: 0, scale: 0.7 },
    {
      keyframes: [
        { opacity: 1, y: -14, scale: 1, duration: 0.32, ease: 'back.out(2)' },
        { opacity: 0, y: -42, duration: 0.75, ease: 'power2.in' },
      ],
      onComplete: () => badge.remove(),
    }
  );
}

/**
 * Numeric count-up tween.
 */
export function countTo(
  el: HTMLElement | null,
  target: number,
  fmt: (val: number) => string,
  duration = 0.9,
  delay = 0
): gsap.core.Tween | null {
  if (!el) return null;
  if (reducedMotion()) {
    el.textContent = fmt(target);
    return null;
  }
  const obj = { v: 0 };
  return gsap.to(obj, {
    v: target,
    duration: dur(duration),
    delay: dur(delay),
    ease: 'power3.out',
    onUpdate: () => {
      el.textContent = fmt(obj.v);
    },
  });
}

/**
 * Springy icon pop for toggles, hearts, and segmented clicks.
 */
export function popIcon(el: HTMLElement | null): void {
  if (!el || reducedMotion()) return;
  const target = (el.querySelector('svg') as SVGElement | null) || el;
  gsap.fromTo(
    target,
    { scale: 0.7 },
    { scale: 1, duration: 0.55, ease: 'back.out(3)', clearProps: 'transform' }
  );
}

/**
 * Subtle horizontal validation shake.
 */
export function shakeEl(el: HTMLElement | null): void {
  if (!el || reducedMotion()) return;
  gsap.to(el, {
    keyframes: { x: [0, -8, 7, -5, 3, 0] },
    duration: 0.42,
    ease: 'power2.out',
    clearProps: 'transform',
  });
}

/**
 * Elastic squash-stretch settle when a dragged planner / pipeline item drops into place.
 */
export function elasticDropSettle(el: HTMLElement | null): void {
  if (!el || reducedMotion()) return;
  gsap.fromTo(
    el,
    { scaleY: 0.86, scaleX: 1.06 },
    {
      scaleY: 1,
      scaleX: 1,
      duration: 0.5,
      ease: 'elastic.out(1, 0.45)',
      clearProps: 'transform',
    }
  );
}

type ClipProxy = { t: number; r: number; b: number; l: number };
const pillProxyMap = new WeakMap<HTMLElement, ClipProxy>();

/**
 * Asymmetric liquid clip-path pill / underline morph.
 */
export function slideClipPill(
  pillEl: HTMLElement | null,
  targetEl: HTMLElement | null,
  opts: { animate?: boolean; radius?: number; line?: boolean } = {}
): void {
  if (!pillEl || !targetEl || !pillEl.parentElement || !pillEl.isConnected || !targetEl.isConnected) {
    return;
  }
  const { animate = true, radius = 14, line = false } = opts;

  const containerRect = pillEl.parentElement.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  if (!containerRect.width || !targetRect.width || !containerRect.height || !targetRect.height) return;

  const left = Math.max(0, targetRect.left - containerRect.left);
  const right = Math.max(0, containerRect.right - targetRect.right);
  const top = Math.max(
    0,
    line ? containerRect.height - 2 : targetRect.top - containerRect.top
  );
  const bottom = Math.max(0, line ? 0 : containerRect.bottom - targetRect.bottom);

  const makeInset = (t: number, r: number, b: number, l: number) =>
    `inset(${Math.max(0, t).toFixed(1)}px ${Math.max(0, r).toFixed(1)}px ${Math.max(
      0,
      b
    ).toFixed(1)}px ${Math.max(0, l).toFixed(1)}px round ${radius}px)`;

  const nextInset = makeInset(top, right, bottom, left);
  const existingProxy = pillProxyMap.get(pillEl);

  if (!animate || !existingProxy || reducedMotion()) {
    if (existingProxy) gsap.killTweensOf(existingProxy);
    const snapProxy: ClipProxy = { t: top, r: right, b: bottom, l: left };
    pillProxyMap.set(pillEl, snapProxy);
    pillEl.style.clipPath = nextInset;
    return;
  }

  gsap.killTweensOf(existingProxy);
  const pt = existingProxy.t;
  const pl = existingProxy.l;

  const update = () => {
    pillEl.style.clipPath = makeInset(
      existingProxy.t,
      existingProxy.r,
      existingProxy.b,
      existingProxy.l
    );
  };

  const movingRight = left > pl;
  const movingDown = top > pt;

  gsap.to(existingProxy, {
    l: left,
    duration: movingRight ? 0.55 : 0.36,
    ease: movingRight ? 'power3.inOut' : 'power3.out',
    onUpdate: update,
  });
  gsap.to(existingProxy, {
    r: right,
    duration: movingRight ? 0.36 : 0.55,
    ease: movingRight ? 'power3.out' : 'power3.inOut',
    onUpdate: update,
  });
  gsap.to(existingProxy, {
    t: top,
    duration: line ? 0.35 : movingDown ? 0.55 : 0.36,
    ease: line ? 'power3.out' : movingDown ? 'power3.inOut' : 'power3.out',
    onUpdate: update,
  });
  gsap.to(existingProxy, {
    b: bottom,
    duration: line ? 0.35 : movingDown ? 0.36 : 0.55,
    ease: line ? 'power3.out' : movingDown ? 'power3.out' : 'power3.inOut',
    onUpdate: update,
  });
}

/**
 * Binds `.magnetic` subtle cursor pull and `[data-lift]` hover elevation on fine pointers.
 */
export function bindMagneticAndLift(root: HTMLElement | null): () => void {
  if (!root || reducedMotion() || !finePointer()) return () => {};

  const cleanups: (() => void)[] = [];

  root.querySelectorAll<HTMLElement>('.magnetic').forEach((el) => {
    if (el.dataset.magBound) return;
    el.dataset.magBound = '1';
    const qx = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
    const qy = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      qx(dx * 0.2);
      qy(dy * 0.28);
    };
    const onLeave = () => {
      qx(0);
      qy(0);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    cleanups.push(() => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      delete el.dataset.magBound;
    });
  });

  root.querySelectorAll<HTMLElement>('[data-lift]').forEach((el) => {
    if (el.dataset.liftBound) return;
    el.dataset.liftBound = '1';
    const onEnter = () => {
      gsap.to(el, { y: -4, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
    };
    const onLeave = () => {
      gsap.to(el, { y: 0, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
    };
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    cleanups.push(() => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      delete el.dataset.liftBound;
    });
  });

  return () => {
    cleanups.forEach((fn) => fn());
  };
}

/**
 * Circular View Transition theme ripple from the triggering button/center.
 */
export function performThemeTransition(
  applyTheme: () => void,
  anchorEl?: HTMLElement | null
): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => {
      ready: Promise<void>;
    };
  };

  if (reducedMotion() || !doc.startViewTransition) {
    applyTheme();
    return;
  }

  let cx = window.innerWidth - 40;
  let cy = 40;
  if (anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    if (r.width || r.height) {
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    }
  }

  const maxR = Math.hypot(
    Math.max(cx, window.innerWidth - cx),
    Math.max(cy, window.innerHeight - cy)
  );

  const vt = doc.startViewTransition(() => {
    applyTheme();
  });

  vt.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${cx}px ${cy}px)`,
            `circle(${maxR}px at ${cx}px ${cy}px)`,
          ],
        },
        {
          duration: 450,
          easing: 'cubic-bezier(.65,0,.35,1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    })
    .catch(() => {
      // ignore aborted view transition
    });
}
