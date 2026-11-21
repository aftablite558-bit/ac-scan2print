import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import {
  LIQUID_METAL_RIPPLE_DURATION,
  LIQUID_METAL_VERTEX_SHADER,
  MERCURY_ACTION_Y,
  MERCURY_AUTH_CENTER_X,
  MERCURY_AUTH_HALF_HEIGHT,
  MERCURY_AUTH_HALF_WIDTH,
  MERCURY_CANCEL_CENTER_X,
  MERCURY_CANCEL_HALF_HEIGHT,
  MERCURY_CANCEL_HALF_WIDTH,
  MERCURY_CENTER_X,
  MERCURY_CENTER_Y,
  MERCURY_CLOSE_DURATION,
  MERCURY_FIELD_GAP,
  MERCURY_FIELD_HALF_HEIGHT,
  MERCURY_FIELD_HALF_WIDTH,
  MERCURY_OPEN_SETTLE_DURATION,
  MERCURY_PILL_HALF_HEIGHT,
  MERCURY_PILL_HALF_WIDTH,
  MERCURY_SNAP_DURATION,
  MERCURY_V4_FRAGMENT_SHADER,
  MERCURY_VIRTUAL_HEIGHT,
  MERCURY_VIRTUAL_WIDTH,
  type MercuryLoginState,
  clamp01,
  computeActionPillHalfSize,
  computeErrorFlushEnvelope,
  computeLoadingKeyLightX,
  computeMercuryGeometry,
  lerp,
  shouldRenderIdleButton,
  shouldShowCredentialsForm,
  shouldUseWebglLiquidMetal,
} from '../lib/liquidMetal';

interface LiquidMetalLoginStageProps {
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  rememberSession: boolean;
  onRememberSessionChange: (value: boolean) => void;
  disabled?: boolean;
  externalError?: string | null;
  onErrorMessage: (message: string | null) => void;
  onSubmitCredentials: () => Promise<void>;
  onOpenForgotPassword: () => void;
  onStateChange?: (state: MercuryLoginState) => void;
}

export const LiquidMetalLoginStage: React.FC<LiquidMetalLoginStageProps> = ({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  rememberSession,
  onRememberSessionChange,
  disabled = false,
  externalError = null,
  onErrorMessage,
  onSubmitCredentials,
  onOpenForgotPassword,
  onStateChange,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const [stageState, setStageState] = useState<MercuryLoginState>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const [stageWidth, setStageWidth] = useState(400);
  const [webglReady, setWebglReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  // Mutable animation refs read by the single unified WebGL2 rAF loop
  const stateRef = useRef<MercuryLoginState>('idle');
  const t0Ref = useRef(0);
  const mergeTRef = useRef(-9);
  const wrongAtRef = useRef(-9);
  const pressRef = useRef(0);
  const pressTargetRef = useRef(0);
  const winRef = useRef(0);
  const actTRef = useRef(0);
  const actBRef = useRef(0);
  const cancelHoverRef = useRef(0);
  const cancelHoverTargetRef = useRef(0);
  const cancelPressRef = useRef(0);
  const cancelPressTargetRef = useRef(0);
  const authHoverRef = useRef(0);
  const authHoverTargetRef = useRef(0);
  const authPressRef = useRef(0);
  const authPressTargetRef = useRef(0);
  const cancelRipAtRef = useRef(-9);
  const authRipAtRef = useRef(-9);
  const btnHitRef = useRef<[number, number]>([MERCURY_AUTH_CENTER_X, MERCURY_ACTION_Y]);

  const focusedRef = useRef<'email' | 'password' | null>(null);
  const disabledRef = useRef(disabled);
  const submittingRef = useRef(false);
  const retryRef = useRef(false);
  const mountedRef = useRef(true);
  const hitRef = useRef<[number, number]>([MERCURY_CENTER_X, MERCURY_CENTER_Y]);
  const kickLoopRef = useRef<(() => void) | null>(null);
  const wrongTimerRef = useRef<number | null>(null);
  const actionCloseTimerRef = useRef<number | null>(null);

  const submitCredentialsRef = useRef(onSubmitCredentials);
  const onPasswordChangeRef = useRef(onPasswordChange);
  const onErrorMessageRef = useRef(onErrorMessage);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    submitCredentialsRef.current = onSubmitCredentials;
  }, [onSubmitCredentials]);

  useEffect(() => {
    onPasswordChangeRef.current = onPasswordChange;
  }, [onPasswordChange]);

  useEffect(() => {
    onErrorMessageRef.current = onErrorMessage;
  }, [onErrorMessage]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    disabledRef.current = disabled;
    kickLoopRef.current?.();
  }, [disabled]);

  useEffect(() => {
    focusedRef.current = focusedField;
    kickLoopRef.current?.();
  }, [focusedField]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (wrongTimerRef.current !== null) {
        window.clearTimeout(wrongTimerRef.current);
      }
      if (actionCloseTimerRef.current !== null) {
        window.clearTimeout(actionCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const transitionTo = useCallback((next: MercuryLoginState, preserveTimer = false) => {
    if (!mountedRef.current) return;
    stateRef.current = next;
    if (!preserveTimer) {
      t0Ref.current = performance.now() / 1000;
    }
    if (next !== 'open') {
      cancelHoverTargetRef.current = 0;
      cancelPressTargetRef.current = 0;
      authHoverTargetRef.current = 0;
      authPressTargetRef.current = 0;
    }
    setStageState(next);
    onStateChangeRef.current?.(next);
    kickLoopRef.current?.();
  }, []);

  const focusActiveFieldAfterOpen = useCallback(() => {
    window.requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      if (retryRef.current) {
        passwordInputRef.current?.focus();
      } else {
        emailInputRef.current?.focus();
      }
    });
  }, []);

  const triggerWrongAnimation = useCallback(
    (message: string) => {
      if (!mountedRef.current) return;
      submittingRef.current = false;
      wrongAtRef.current = performance.now() / 1000;
      onErrorMessageRef.current(message);
      transitionTo('wrong');

      if (wrongTimerRef.current !== null) {
        window.clearTimeout(wrongTimerRef.current);
      }
      const holdMs = reducedMotion ? 750 : LIQUID_METAL_RIPPLE_DURATION * 1000;
      wrongTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        onPasswordChangeRef.current('');
        retryRef.current = true;
        if (reducedMotion) {
          transitionTo('open');
          focusActiveFieldAfterOpen();
        } else {
          transitionTo('opening');
        }
      }, holdMs);
    },
    [focusActiveFieldAfterOpen, reducedMotion, transitionTo]
  );

  // If AdminContext reports an external authError while loading (e.g. backend verification rejection)
  useEffect(() => {
    if (externalError && stateRef.current === 'loading') {
      triggerWrongAnimation(externalError);
    }
  }, [externalError, triggerWrongAnimation]);

  const executeAuthentication = useCallback(async () => {
    try {
      await submitCredentialsRef.current();
      if (!mountedRef.current) return;
      submittingRef.current = false;
      transitionTo('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials';
      triggerWrongAnimation(msg);
    }
  }, [transitionTo, triggerWrongAnimation]);

  // Fallback / reduced-motion state machine timers when WebGL2 rAF is not driving transitions
  useEffect(() => {
    if (webglReady && !reducedMotion) return;

    if (stageState === 'opening') {
      const delay = reducedMotion ? 16 : 260;
      const id = window.setTimeout(() => {
        transitionTo('open');
        focusActiveFieldAfterOpen();
      }, delay);
      return () => window.clearTimeout(id);
    }

    if (stageState === 'closing') {
      const delay = reducedMotion ? 16 : 260;
      const id = window.setTimeout(() => {
        mergeTRef.current = performance.now() / 1000;
        if (submittingRef.current) {
          transitionTo('loading');
          void executeAuthentication();
        } else {
          transitionTo('idle');
        }
      }, delay);
      return () => window.clearTimeout(id);
    }
  }, [
    executeAuthentication,
    focusActiveFieldAfterOpen,
    reducedMotion,
    stageState,
    transitionTo,
    webglReady,
  ]);

  // Measure container width so virtual 540x476 layout scales responsively
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const updateWidth = () => {
      const w = el.clientWidth;
      if (w > 0) setStageWidth(w);
    };
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    updateWidth();
    return () => ro.disconnect();
  }, []);

  // Single Unified WebGL2 Morphing Liquid Metal V4 Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion) {
      setWebglReady(false);
      return;
    }

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2', {
        premultipliedAlpha: true,
        antialias: false,
        powerPreference: 'low-power',
      });
    } catch {
      gl = null;
    }

    if (!shouldUseWebglLiquidMetal({ hasWebgl2: Boolean(gl), reducedMotion }) || !gl) {
      setWebglReady(false);
      return;
    }

    const compileShader = (type: number, source: string) => {
      const s = gl!.createShader(type);
      if (!s) throw new Error('Shader creation failed');
      gl!.shaderSource(s, source);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
        const msg = gl!.getShaderInfoLog(s) || 'Shader compile error';
        gl!.deleteShader(s);
        throw new Error(msg);
      }
      return s;
    };

    let program: WebGLProgram | null = null;
    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let vbo: WebGLBuffer | null = null;

    try {
      vs = compileShader(gl.VERTEX_SHADER, LIQUID_METAL_VERTEX_SHADER);
      fs = compileShader(gl.FRAGMENT_SHADER, MERCURY_V4_FRAGMENT_SHADER);
      program = gl.createProgram();
      if (!program) throw new Error('Program creation failed');
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
      }
      gl.useProgram(program);

      vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    } catch {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      if (program) gl.deleteProgram(program);
      if (vbo) gl.deleteBuffer(vbo);
      setWebglReady(false);
      return;
    }

    setWebglReady(true);

    const U = {
      A: gl.getUniformLocation(program, 'A'),
      B: gl.getUniformLocation(program, 'B'),
      NECK: gl.getUniformLocation(program, 'NECK'),
      FX: gl.getUniformLocation(program, 'FX'),
      ERR: gl.getUniformLocation(program, 'ERR'),
      KEY: gl.getUniformLocation(program, 'KEY'),
      RAD: gl.getUniformLocation(program, 'RAD'),
      P: gl.getUniformLocation(program, 'P'),
      ACT: gl.getUniformLocation(program, 'ACT'),
      RES: gl.getUniformLocation(program, 'RES'),
      THICK: gl.getUniformLocation(program, 'THICK'),
      rest: gl.getUniformLocation(program, 'rest'),
      waist: gl.getUniformLocation(program, 'waist'),
      snap: gl.getUniformLocation(program, 'snap'),
      win: gl.getUniformLocation(program, 'win'),
      field: gl.getUniformLocation(program, 'field'),
      SCALE: gl.getUniformLocation(program, 'SCALE'),
      u_disabled: gl.getUniformLocation(program, 'u_disabled'),
      u_cancelBox: gl.getUniformLocation(program, 'u_cancelBox'),
      u_authBox: gl.getUniformLocation(program, 'u_authBox'),
      u_btnState: gl.getUniformLocation(program, 'u_btnState'),
      u_btnRipple: gl.getUniformLocation(program, 'u_btnRipple'),
      u_btnMeta: gl.getUniformLocation(program, 'u_btnMeta'),
    };

    let scale = 1;
    let disposed = false;
    let rafId = 0;
    let prev = performance.now() / 1000;

    const syncCanvasSize = () => {
      if (!canvas || !gl) return;
      const cssW = Math.max(240, canvas.clientWidth || MERCURY_VIRTUAL_WIDTH);
      const k = cssW / MERCURY_VIRTUAL_WIDTH;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(MERCURY_VIRTUAL_WIDTH * k * dpr);
      canvas.height = Math.round(MERCURY_VIRTUAL_HEIGHT * k * dpr);
      scale = k * dpr;
      kickLoop();
    };

    const drawFrame = () => {
      if (disposed || !gl || !canvas) return;
      rafId = 0;
      const t = performance.now() / 1000;
      const dt = Math.min(0.05, Math.max(0.001, t - prev));
      prev = t;

      const curState = stateRef.current;
      const tau = t - t0Ref.current;

      if (curState === 'opening' && tau > MERCURY_SNAP_DURATION + MERCURY_OPEN_SETTLE_DURATION) {
        transitionTo('open', true);
        focusActiveFieldAfterOpen();
      } else if (curState === 'closing' && tau >= MERCURY_CLOSE_DURATION) {
        mergeTRef.current = t;
        if (submittingRef.current) {
          transitionTo('loading');
          void executeAuthentication();
        } else {
          transitionTo('idle');
        }
      }

      const ease = (k: number) => Math.min(1, dt * k);
      pressRef.current +=
        ((stateRef.current === 'idle' ? pressTargetRef.current : 0) - pressRef.current) * ease(22);
      const winTarget = stateRef.current === 'done' ? 1 : 0;
      winRef.current += (winTarget - winRef.current) * ease(stateRef.current === 'done' ? 9 : 6);
      actTRef.current += ((focusedRef.current === 'email' ? 1 : 0) - actTRef.current) * ease(14);
      actBRef.current += ((focusedRef.current === 'password' ? 1 : 0) - actBRef.current) * ease(14);

      cancelHoverRef.current += (cancelHoverTargetRef.current - cancelHoverRef.current) * ease(16);
      cancelPressRef.current += (cancelPressTargetRef.current - cancelPressRef.current) * ease(24);
      authHoverRef.current += (authHoverTargetRef.current - authHoverRef.current) * ease(16);
      authPressRef.current += (authPressTargetRef.current - authPressRef.current) * ease(24);

      const g = computeMercuryGeometry({
        state: stateRef.current,
        stateElapsedSec: t - t0Ref.current,
        mergeElapsedSec: t - mergeTRef.current,
        wrongElapsedSec: t - wrongAtRef.current,
        pressAmount: pressRef.current,
      });

      const kx =
        stateRef.current === 'loading' ? computeLoadingKeyLightX(t - t0Ref.current) : -0.45;
      const kl = Math.hypot(kx, 0.75, 0.7);
      const hh = g.hh;
      const yT = MERCURY_CENTER_Y - g.gap / 2 - hh;
      const yB = MERCURY_CENTER_Y + g.gap / 2 + hh;
      const errElapsed = t - wrongAtRef.current;
      const red =
        stateRef.current === 'wrong' ||
        (errElapsed >= 0 && errElapsed <= LIQUID_METAL_RIPPLE_DURATION + 0.3)
          ? computeErrorFlushEnvelope(errElapsed)
          : 0;
      const rings =
        errElapsed >= 0 && errElapsed <= LIQUID_METAL_RIPPLE_DURATION + 0.3 ? errElapsed : -1;

      const actionAppear = clamp01((g.field - 0.12) / 0.88);
      const [cancelHw, cancelHh] = computeActionPillHalfSize({
        baseHalfWidth: MERCURY_CANCEL_HALF_WIDTH,
        baseHalfHeight: MERCURY_CANCEL_HALF_HEIGHT,
        pressAmount: cancelPressRef.current,
        hoverAmount: cancelHoverRef.current,
        appearAmount: actionAppear,
      });
      const [authHw, authHh] = computeActionPillHalfSize({
        baseHalfWidth: MERCURY_AUTH_HALF_WIDTH,
        baseHalfHeight: MERCURY_AUTH_HALF_HEIGHT,
        pressAmount: authPressRef.current,
        hoverAmount: authHoverRef.current,
        appearAmount: actionAppear,
      });

      const cancelRipElapsed = t - cancelRipAtRef.current;
      const authRipElapsed = t - authRipAtRef.current;
      const authSpecX =
        -0.38 +
        0.52 * Math.sin(t * 1.45) +
        ((btnHitRef.current[0] - MERCURY_AUTH_CENTER_X) / MERCURY_AUTH_HALF_WIDTH) *
          0.35 *
          authHoverRef.current;

      gl.uniform4f(U.A, MERCURY_CENTER_X, yT, g.hw, hh);
      gl.uniform4f(U.B, MERCURY_CENTER_X, yB, g.hw, hh);
      gl.uniform4f(U.NECK, MERCURY_CENTER_Y - g.gap / 2, MERCURY_CENTER_Y + g.gap / 2, g.patch, 0);
      gl.uniform4f(U.FX, g.flash, g.merge, winRef.current * 0.8, g.shiver);
      gl.uniform3f(U.KEY, kx / kl, -0.75 / kl, 0.7 / kl);
      gl.uniform4f(U.ERR, rings, red, hitRef.current[0], hitRef.current[1]);
      gl.uniform2f(U.RAD, g.rOut, g.rIn);
      gl.uniform2f(U.P, g.pillHalf[0], g.pillHalf[1]);
      gl.uniform2f(U.ACT, actTRef.current, actBRef.current);
      gl.uniform2f(U.RES, canvas.width, canvas.height);
      gl.uniform1f(U.THICK, lerp(hh, 7, g.field));
      gl.uniform1f(U.rest, g.rest);
      gl.uniform1f(U.waist, g.waist);
      gl.uniform1f(U.snap, g.snap);
      gl.uniform1f(U.win, winRef.current);
      gl.uniform1f(U.field, g.field);
      gl.uniform1f(U.SCALE, scale);
      gl.uniform1f(U.u_disabled, disabledRef.current ? 1 : 0);

      gl.uniform4f(U.u_cancelBox, MERCURY_CANCEL_CENTER_X, MERCURY_ACTION_Y, cancelHw, cancelHh);
      gl.uniform4f(U.u_authBox, MERCURY_AUTH_CENTER_X, MERCURY_ACTION_Y, authHw, authHh);
      gl.uniform4f(
        U.u_btnState,
        cancelHoverRef.current,
        cancelPressRef.current,
        authHoverRef.current,
        authPressRef.current
      );
      gl.uniform4f(
        U.u_btnRipple,
        cancelRipElapsed >= 0 && cancelRipElapsed <= 0.9 ? cancelRipElapsed : -1,
        authRipElapsed >= 0 && authRipElapsed <= 0.9 ? authRipElapsed : -1,
        btnHitRef.current[0],
        btnHitRef.current[1]
      );
      gl.uniform2f(U.u_btnMeta, actionAppear, authSpecX);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      const sNow = stateRef.current;
      const settleTau = t - t0Ref.current;
      const isAnim =
        sNow === 'opening' ||
        sNow === 'closing' ||
        sNow === 'loading' ||
        sNow === 'wrong' ||
        sNow === 'open' ||
        (sNow === 'idle' && settleTau < 0.1) ||
        (t - mergeTRef.current >= 0 && t - mergeTRef.current < 1.25) ||
        (cancelRipElapsed >= 0 && cancelRipElapsed < 0.92) ||
        (authRipElapsed >= 0 && authRipElapsed < 0.92) ||
        Math.abs(pressTargetRef.current - pressRef.current) > 0.004 ||
        Math.abs(winTarget - winRef.current) > 0.004 ||
        Math.abs(cancelHoverTargetRef.current - cancelHoverRef.current) > 0.004 ||
        Math.abs(cancelPressTargetRef.current - cancelPressRef.current) > 0.004 ||
        Math.abs(authHoverTargetRef.current - authHoverRef.current) > 0.004 ||
        Math.abs(authPressTargetRef.current - authPressRef.current) > 0.004;

      if (isAnim && !disposed) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    const kickLoop = () => {
      if (disposed || rafId) return;
      rafId = window.requestAnimationFrame(drawFrame);
    };
    kickLoopRef.current = kickLoop;

    const ro = new ResizeObserver(syncCanvasSize);
    ro.observe(canvas);
    syncCanvasSize();

    return () => {
      disposed = true;
      kickLoopRef.current = null;
      ro.disconnect();
      if (rafId) window.cancelAnimationFrame(rafId);
      if (vs) gl!.deleteShader(vs);
      if (fs) gl!.deleteShader(fs);
      if (program) gl!.deleteProgram(program);
      if (vbo) gl!.deleteBuffer(vbo);
    };
  }, [executeAuthentication, focusActiveFieldAfterOpen, reducedMotion, transitionTo]);

  const handleOpenClick = () => {
    if (disabled || stageState !== 'idle') return;
    onErrorMessage(null);
    retryRef.current = false;
    if (reducedMotion) {
      transitionTo('open');
      focusActiveFieldAfterOpen();
    } else {
      transitionTo('opening');
    }
  };

  const handleBeginSubmit = () => {
    if (disabled || submittingRef.current || stageState !== 'open') return;
    if (!email.trim()) {
      emailInputRef.current?.focus();
      onErrorMessage('Please enter your administrator email address.');
      return;
    }
    if (!password) {
      passwordInputRef.current?.focus();
      onErrorMessage('Please enter your administrator password.');
      return;
    }

    onErrorMessage(null);
    submittingRef.current = true;
    authRipAtRef.current = performance.now() / 1000;
    kickLoopRef.current?.();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setFocusedField(null);

    if (reducedMotion) {
      transitionTo('loading');
      void executeAuthentication();
      return;
    }

    if (actionCloseTimerRef.current !== null) {
      window.clearTimeout(actionCloseTimerRef.current);
    }
    // Brief ~90ms liquid-ripple beat before closing halves around the form
    actionCloseTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current || !submittingRef.current) return;
      transitionTo('closing');
    }, 90);
  };

  const handleCloseToIdle = () => {
    if (stageState !== 'open' || submittingRef.current) return;
    onErrorMessage(null);
    onPasswordChange('');
    setShowPassword(false);
    setFocusedField(null);
    cancelRipAtRef.current = performance.now() / 1000;
    kickLoopRef.current?.();

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (reducedMotion) {
      transitionTo('idle');
      return;
    }

    if (actionCloseTimerRef.current !== null) {
      window.clearTimeout(actionCloseTimerRef.current);
    }
    actionCloseTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current || submittingRef.current) return;
      transitionTo('closing');
    }, 70);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (stageState === 'open') {
      handleBeginSubmit();
    }
  };

  const updatePointerCoords = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const kx = MERCURY_VIRTUAL_WIDTH / rect.width;
    const ky = MERCURY_VIRTUAL_HEIGHT / rect.height;
    const vx = (clientX - rect.left) * kx;
    const vy = (clientY - rect.top) * ky;
    hitRef.current = [
      clamp01(
        vx,
        MERCURY_CENTER_X - MERCURY_PILL_HALF_WIDTH + 30,
        MERCURY_CENTER_X + MERCURY_PILL_HALF_WIDTH - 30
      ),
      MERCURY_CENTER_Y,
    ];
    btnHitRef.current = [
      clamp01(vx, 20, MERCURY_VIRTUAL_WIDTH - 20),
      clamp01(vy, MERCURY_ACTION_Y - 36, MERCURY_ACTION_Y + 36),
    ];
    kickLoopRef.current?.();
  };

  const kScale = stageWidth / MERCURY_VIRTUAL_WIDTH;
  const showFields = shouldShowCredentialsForm(stageState);
  const showIdleBtn = shouldRenderIdleButton(stageState);
  const isOpen = stageState === 'open';
  const isLoading = stageState === 'loading';
  const isWrong = stageState === 'wrong';
  const isDone = stageState === 'done';

  // Exact height & vertical stage alignment per phase
  const stageWrapperHeight =
    stageState === 'opening' || stageState === 'closing'
      ? Math.round(330 * kScale)
      : stageState === 'open'
        ? Math.round(388 * kScale)
        : Math.round(108 * kScale);

  const stageTopOffsetPx =
    stageState === 'opening' || stageState === 'closing'
      ? Math.round(-28 * kScale)
      : stageState === 'open'
        ? Math.round(-68 * kScale)
        : Math.round(-(MERCURY_CENTER_Y - 54) * kScale);

  // Field boxes in virtual 540x476 coordinates matching shader A & B
  const fieldWidth = MERCURY_FIELD_HALF_WIDTH * 2;
  const fieldHeight = MERCURY_FIELD_HALF_HEIGHT * 2;
  const fieldLeft = MERCURY_CENTER_X - MERCURY_FIELD_HALF_WIDTH;
  const fieldTop1 = MERCURY_CENTER_Y - MERCURY_FIELD_GAP / 2 - fieldHeight;
  const fieldTop2 = MERCURY_CENTER_Y + MERCURY_FIELD_GAP / 2;

  const pillLeft = MERCURY_CENTER_X - MERCURY_PILL_HALF_WIDTH;
  const pillTop = MERCURY_CENTER_Y - MERCURY_PILL_HALF_HEIGHT;
  const pillWidth = MERCURY_PILL_HALF_WIDTH * 2;
  const pillHeight = MERCURY_PILL_HALF_HEIGHT * 2;

  const cancelLeft = MERCURY_CANCEL_CENTER_X - MERCURY_CANCEL_HALF_WIDTH;
  const cancelTop = MERCURY_ACTION_Y - MERCURY_CANCEL_HALF_HEIGHT;
  const cancelWidth = MERCURY_CANCEL_HALF_WIDTH * 2;
  const cancelHeight = MERCURY_CANCEL_HALF_HEIGHT * 2;

  const authLeft = MERCURY_AUTH_CENTER_X - MERCURY_AUTH_HALF_WIDTH;
  const authTop = MERCURY_ACTION_Y - MERCURY_AUTH_HALF_HEIGHT;
  const authWidth = MERCURY_AUTH_HALF_WIDTH * 2;
  const authHeight = MERCURY_AUTH_HALF_HEIGHT * 2;

  const buttonLabel = isLoading
    ? 'Verifying Admin...'
    : isDone
      ? 'Admin Verified'
      : isWrong
        ? 'Verification Failed'
        : 'Sign In to Control Center';

  const fallbackPillClass = isWrong
    ? 'bg-gradient-to-b from-[#ff5762] via-[#d92d3a] to-[#8f1822] text-[#FFF5F6] border-[#ff8089]/60 shadow-[0_10px_28px_-10px_rgba(255,66,77,0.65)]'
    : isDone
      ? 'bg-gradient-to-b from-[#66e6f3] via-[#25C7D9] to-[#128997] text-[#071A1E] border-[#8CF2FC]/70 shadow-[0_12px_30px_-10px_rgba(37,199,217,0.65)]'
      : disabled
        ? 'bg-gradient-to-b from-[#2A313D] via-[#202630] to-[#161A22] text-[#B8C4D2] border-white/15'
        : 'bg-gradient-to-b from-[#EFF6FB] via-[#B9D4DF] to-[#4F6D7A] hover:from-[#FFFFFF] hover:via-[#9AE8F2] hover:to-[#25C7D9] text-[#0B1016] border-white/60 shadow-[0_10px_28px_-12px_rgba(37,199,217,0.5)]';

  const fallbackCancelClass =
    'bg-gradient-to-b from-[#E6EEF6] via-[#AEBCCB] to-[#536273] hover:from-[#F6FAFE] hover:via-[#C9D8E7] hover:to-[#6E8094] text-[#0A1117] border-white/55 shadow-[0_8px_22px_-10px_rgba(229,237,246,0.4)]';

  const fallbackAuthClass = disabled
    ? 'bg-gradient-to-b from-[#2A313D] via-[#202630] to-[#161A22] text-[#B8C4D2] border-white/15'
    : 'bg-gradient-to-b from-[#EFF8FC] via-[#9EE8F1] to-[#25C7D9] hover:from-[#FFFFFF] hover:via-[#B8F2F9] hover:to-[#32D4E6] text-[#07161B] border-[#B4F4FC]/70 shadow-[0_10px_28px_-10px_rgba(37,199,217,0.58)]';

  return (
    <form
      onSubmit={handleFormSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && isOpen) {
          e.preventDefault();
          handleCloseToIdle();
        }
      }}
      data-mercury-state={stageState}
      className="space-y-4"
      noValidate
    >
      {/* Scaled 540x476 Unified Liquid Metal Morphing Stage (Single WebGL2 Canvas) */}
      <div
        ref={wrapperRef}
        onPointerMove={(e) => updatePointerCoords(e.clientX, e.clientY)}
        onPointerLeave={() => {
          hitRef.current = [MERCURY_CENTER_X, MERCURY_CENTER_Y];
          btnHitRef.current = [MERCURY_AUTH_CENTER_X, MERCURY_ACTION_Y];
          pressTargetRef.current = 0;
          cancelHoverTargetRef.current = 0;
          cancelPressTargetRef.current = 0;
          authHoverTargetRef.current = 0;
          authPressTargetRef.current = 0;
          kickLoopRef.current?.();
        }}
        style={{ height: `${Math.max(58, stageWrapperHeight)}px` }}
        className="relative w-full overflow-visible transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      >
        <div
          className="absolute left-0 w-full pointer-events-none transition-[top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            top: `${stageTopOffsetPx}px`,
            aspectRatio: `${MERCURY_VIRTUAL_WIDTH} / ${MERCURY_VIRTUAL_HEIGHT}`,
          }}
        >
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-200 ${
              webglReady ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Virtual 540x476 Interactive Overlay Layer */}
          <div
            style={{
              width: `${MERCURY_VIRTUAL_WIDTH}px`,
              height: `${MERCURY_VIRTUAL_HEIGHT}px`,
              transform: `scale(${kScale})`,
            }}
            className="absolute left-0 top-0 origin-top-left pointer-events-none"
          >
            {/* IDLE / LOADING / WRONG / DONE CLOSED PILL BUTTON */}
            {showIdleBtn && (
              <button
                type="button"
                disabled={disabled || isLoading || isWrong || isDone}
                onClick={handleOpenClick}
                onPointerDown={() => {
                  if (!disabled && stageState === 'idle') {
                    pressTargetRef.current = 1;
                    kickLoopRef.current?.();
                  }
                }}
                onPointerUp={() => {
                  pressTargetRef.current = 0;
                  kickLoopRef.current?.();
                }}
                onPointerCancel={() => {
                  pressTargetRef.current = 0;
                  kickLoopRef.current?.();
                }}
                aria-busy={isLoading}
                style={{
                  left: `${pillLeft}px`,
                  top: `${pillTop}px`,
                  width: `${pillWidth}px`,
                  height: `${pillHeight}px`,
                }}
                className={`pointer-events-auto absolute rounded-full flex items-center justify-center gap-3 px-6 font-bold text-[22px] tracking-[0.01em] transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-[#25C7D9] focus-visible:outline-offset-4 cursor-pointer disabled:cursor-not-allowed ${
                  webglReady
                    ? isWrong
                      ? 'bg-transparent text-[#FFF1F2] [text-shadow:0_1.5px_2px_rgba(65,0,10,0.65)]'
                      : disabled
                        ? 'bg-transparent text-[#DCE6F0] [text-shadow:0_1.5px_2px_rgba(0,0,0,0.65)]'
                        : 'bg-transparent text-[#091217] [text-shadow:0_1.2px_0_rgba(255,255,255,0.48)]'
                    : `border ${fallbackPillClass}`
                }`}
              >
                {isLoading && <Loader2 size={24} className="animate-spin shrink-0" aria-hidden="true" />}
                {isDone && <Check size={24} strokeWidth={2.8} className="shrink-0" aria-hidden="true" />}
                {isWrong && <AlertCircle size={24} className="shrink-0" aria-hidden="true" />}
                <span>{buttonLabel}</span>
                {stageState === 'idle' && <ArrowRight size={24} aria-hidden="true" />}
              </button>
            )}

            {/* SEPARATED LIQUID-METAL CREDENTIAL FIELDS & ACTION PILLS */}
            {showFields && (
              <>
                {/* Email Field inside Top Metal Frame */}
                <div
                  style={{
                    left: `${fieldLeft}px`,
                    top: `${fieldTop1}px`,
                    width: `${fieldWidth}px`,
                    height: `${fieldHeight}px`,
                  }}
                  className={`absolute box-border px-[26px] pt-[12px] rounded-[16px] transition-opacity duration-200 ${
                    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                  } ${
                    !webglReady
                      ? `bg-[#111318]/95 border ${
                          focusedField === 'email'
                            ? 'border-[#25C7D9] shadow-[0_0_0_2px_rgba(37,199,217,0.22)]'
                            : 'border-white/20'
                        }`
                      : ''
                  }`}
                >
                  <label
                    htmlFor="admin-email"
                    className="block text-[17px] font-semibold tracking-[0.02em] text-[#9EB0C2] select-none"
                  >
                    Admin email
                  </label>
                  <input
                    ref={emailInputRef}
                    id="admin-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    autoCapitalize="off"
                    spellCheck={false}
                    tabIndex={isOpen ? 0 : -1}
                    value={email}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField((f) => (f === 'email' ? null : f))}
                    onChange={(e) => {
                      onEmailChange(e.target.value);
                      onErrorMessage(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        passwordInputRef.current?.focus();
                      }
                    }}
                    placeholder="admin@amancomputer.in"
                    className="block w-full mt-[4px] p-0 border-0 outline-none bg-transparent text-[24px] font-medium text-[#F5F8FC] placeholder:text-[#5F7184] caret-[#25C7D9]"
                  />
                </div>

                {/* Password Field inside Bottom Metal Frame */}
                <div
                  style={{
                    left: `${fieldLeft}px`,
                    top: `${fieldTop2}px`,
                    width: `${fieldWidth}px`,
                    height: `${fieldHeight}px`,
                  }}
                  className={`absolute box-border pl-[26px] pr-[84px] pt-[12px] rounded-[16px] transition-opacity duration-200 ${
                    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                  } ${
                    !webglReady
                      ? `bg-[#111318]/95 border ${
                          focusedField === 'password'
                            ? 'border-[#25C7D9] shadow-[0_0_0_2px_rgba(37,199,217,0.22)]'
                            : 'border-white/20'
                        }`
                      : ''
                  }`}
                >
                  <label
                    htmlFor="admin-password"
                    className="block text-[17px] font-semibold tracking-[0.02em] text-[#9EB0C2] select-none"
                  >
                    Password
                  </label>
                  <input
                    ref={passwordInputRef}
                    id="admin-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    tabIndex={isOpen ? 0 : -1}
                    value={password}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField((f) => (f === 'password' ? null : f))}
                    onChange={(e) => {
                      onPasswordChange(e.target.value);
                      onErrorMessage(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleBeginSubmit();
                      }
                    }}
                    placeholder="Enter password"
                    className="block w-full mt-[4px] p-0 border-0 outline-none bg-transparent text-[24px] font-medium text-[#F5F8FC] placeholder:text-[#5F7184] caret-[#25C7D9]"
                  />
                  <button
                    type="button"
                    tabIndex={isOpen ? 0 : -1}
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-[16px] top-1/2 -translate-y-1/2 w-[66px] h-[66px] rounded-[14px] flex items-center justify-center text-[#9EB0C2] hover:text-[#25C7D9] focus-visible:outline-2 focus-visible:outline-[#25C7D9] cursor-pointer transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff size={26} aria-hidden="true" />
                    ) : (
                      <Eye size={26} aria-hidden="true" />
                    )}
                  </button>
                </div>

                {/* Remember Session & Forgot Password Row (mounted ONLY when open) */}
                {isOpen && (
                  <div
                    style={{
                      left: `${fieldLeft}px`,
                      top: '298px',
                      width: `${fieldWidth}px`,
                      height: '58px',
                    }}
                    className="pointer-events-auto absolute flex items-center justify-between gap-4 px-1"
                  >
                    <label
                      htmlFor="remember-session"
                      className="inline-flex items-center gap-[12px] h-[54px] pr-2 text-[20px] text-[#C5D2E0] cursor-pointer select-none"
                    >
                      <input
                        id="remember-session"
                        type="checkbox"
                        checked={rememberSession}
                        onChange={(e) => onRememberSessionChange(e.target.checked)}
                        className="w-[22px] h-[22px] rounded border-white/25 bg-[#111318] accent-[#25C7D9] cursor-pointer shrink-0"
                      />
                      <span>Remember session</span>
                    </label>

                    <button
                      type="button"
                      onClick={onOpenForgotPassword}
                      className="h-[54px] px-2 text-[20px] font-medium text-[#25C7D9] hover:text-[#6EE5F2] hover:underline focus-visible:outline-2 focus-visible:outline-[#25C7D9] rounded-[8px] cursor-pointer transition-colors shrink-0"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Unified Liquid Metal Cancel Pill */}
                <button
                  type="button"
                  tabIndex={isOpen ? 0 : -1}
                  disabled={!isOpen}
                  onClick={handleCloseToIdle}
                  onPointerEnter={() => {
                    if (!isOpen) return;
                    cancelHoverTargetRef.current = 1;
                    kickLoopRef.current?.();
                  }}
                  onPointerLeave={() => {
                    cancelHoverTargetRef.current = 0;
                    cancelPressTargetRef.current = 0;
                    kickLoopRef.current?.();
                  }}
                  onPointerDown={() => {
                    if (!isOpen) return;
                    cancelPressTargetRef.current = 1;
                    cancelRipAtRef.current = performance.now() / 1000;
                    kickLoopRef.current?.();
                  }}
                  onPointerUp={() => {
                    cancelPressTargetRef.current = 0;
                    kickLoopRef.current?.();
                  }}
                  onPointerCancel={() => {
                    cancelPressTargetRef.current = 0;
                    kickLoopRef.current?.();
                  }}
                  aria-label="Cancel sign in"
                  style={{
                    left: `${cancelLeft}px`,
                    top: `${cancelTop}px`,
                    width: `${cancelWidth}px`,
                    height: `${cancelHeight}px`,
                  }}
                  className={`absolute rounded-full flex items-center justify-center px-4 font-bold text-[21px] tracking-[0.01em] whitespace-nowrap transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#25C7D9] focus-visible:outline-offset-4 cursor-pointer active:scale-[0.98] ${
                    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                  } ${
                    webglReady
                      ? 'bg-transparent text-[#091217] [text-shadow:0_1.2px_0_rgba(255,255,255,0.52)]'
                      : `border ${fallbackCancelClass}`
                  }`}
                >
                  <span>Cancel</span>
                </button>

                {/* Unified Liquid Metal Authenticate & Sign In Pill */}
                <button
                  type="submit"
                  tabIndex={isOpen ? 0 : -1}
                  disabled={!isOpen || disabled}
                  onPointerEnter={() => {
                    if (!isOpen || disabled) return;
                    authHoverTargetRef.current = 1;
                    kickLoopRef.current?.();
                  }}
                  onPointerLeave={() => {
                    authHoverTargetRef.current = 0;
                    authPressTargetRef.current = 0;
                    kickLoopRef.current?.();
                  }}
                  onPointerDown={() => {
                    if (!isOpen || disabled) return;
                    authPressTargetRef.current = 1;
                    authRipAtRef.current = performance.now() / 1000;
                    kickLoopRef.current?.();
                  }}
                  onPointerUp={() => {
                    authPressTargetRef.current = 0;
                    kickLoopRef.current?.();
                  }}
                  onPointerCancel={() => {
                    authPressTargetRef.current = 0;
                    kickLoopRef.current?.();
                  }}
                  style={{
                    left: `${authLeft}px`,
                    top: `${authTop}px`,
                    width: `${authWidth}px`,
                    height: `${authHeight}px`,
                  }}
                  className={`absolute rounded-full flex items-center justify-center gap-[8px] px-[18px] font-bold text-[21px] tracking-[0.01em] whitespace-nowrap transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#25C7D9] focus-visible:outline-offset-4 cursor-pointer disabled:cursor-not-allowed active:scale-[0.985] ${
                    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                  } ${
                    webglReady
                      ? disabled
                        ? 'bg-transparent text-[#DCE6F0] [text-shadow:0_1.5px_2px_rgba(0,0,0,0.6)]'
                        : 'bg-transparent text-[#071419] [text-shadow:0_1.2px_0_rgba(255,255,255,0.52)]'
                      : `border ${fallbackAuthClass}`
                  }`}
                >
                  <span>Authenticate &amp; Sign In</span>
                  <ArrowRight size={21} aria-hidden="true" className="shrink-0" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </form>
  );
};
