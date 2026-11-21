import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import {
  LIQUID_METAL_FRAGMENT_SHADER,
  LIQUID_METAL_RIPPLE_DURATION,
  LIQUID_METAL_VERTEX_SHADER,
  type LiquidMetalStatus,
  clamp01,
  computeButtonPillHalfSize,
  computeErrorFlushEnvelope,
  computeLoadingKeyLightX,
  shouldUseWebglLiquidMetal,
} from '../lib/liquidMetal';

interface LiquidMetalButtonProps {
  type?: 'submit' | 'button';
  status: LiquidMetalStatus;
  disabled?: boolean;
  label: string;
  loadingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

const LOGICAL_WIDTH = 440;
const LOGICAL_HEIGHT = 64;

export const LiquidMetalButton: React.FC<LiquidMetalButtonProps> = ({
  type = 'submit',
  status,
  disabled = false,
  label,
  loadingLabel = 'Verifying Admin...',
  successLabel = 'Verified',
  errorLabel = 'Authentication Failed',
  onClick,
  className = '',
  children,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  const [webglReady, setWebglReady] = useState(false);

  const stateRef = useRef({
    status,
    disabled,
    hoverTarget: 0,
    hoverCurrent: 0,
    pressTarget: 0,
    pressCurrent: 0,
    winCurrent: 0,
    loadingStartSec: 0,
    errorStartSec: -10,
    hitX: LOGICAL_WIDTH / 2,
    hitY: LOGICAL_HEIGHT / 2,
    logicalW: LOGICAL_WIDTH,
    logicalH: LOGICAL_HEIGHT,
  });

  const kickLoopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const prevStatus = stateRef.current.status;
    stateRef.current.status = status;
    stateRef.current.disabled = disabled;
    const nowSec = performance.now() / 1000;
    if (status === 'loading' && prevStatus !== 'loading') {
      stateRef.current.loadingStartSec = nowSec;
    }
    if (status === 'error' && prevStatus !== 'error') {
      stateRef.current.errorStartSec = nowSec;
    }
    kickLoopRef.current?.();
  }, [status, disabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || reducedMotion) {
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

    const compileShader = (shaderType: number, source: string) => {
      const sh = gl!.createShader(shaderType);
      if (!sh) throw new Error('Shader creation failed');
      gl!.shaderSource(sh, source);
      gl!.compileShader(sh);
      if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
        const info = gl!.getShaderInfoLog(sh) || 'Shader compile error';
        gl!.deleteShader(sh);
        throw new Error(info);
      }
      return sh;
    };

    let program: WebGLProgram | null = null;
    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let vbo: WebGLBuffer | null = null;

    try {
      vs = compileShader(gl.VERTEX_SHADER, LIQUID_METAL_VERTEX_SHADER);
      fs = compileShader(gl.FRAGMENT_SHADER, LIQUID_METAL_FRAGMENT_SHADER);
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

    const uniforms = {
      res: gl.getUniformLocation(program, 'u_res'),
      center: gl.getUniformLocation(program, 'u_center'),
      half: gl.getUniformLocation(program, 'u_half'),
      hit: gl.getUniformLocation(program, 'u_hit'),
      key: gl.getUniformLocation(program, 'u_key'),
      err: gl.getUniformLocation(program, 'u_err'),
      scale: gl.getUniformLocation(program, 'u_scale'),
      hover: gl.getUniformLocation(program, 'u_hover'),
      win: gl.getUniformLocation(program, 'u_win'),
      disabled: gl.getUniformLocation(program, 'u_disabled'),
    };

    let rafId = 0;
    let disposed = false;
    let prevTime = performance.now() / 1000;
    let scale = 1;

    const syncSize = () => {
      if (!container || !canvas || !gl) return;
      const w = Math.max(180, container.clientWidth);
      const h = Math.max(48, container.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      scale = dpr;
      stateRef.current.logicalW = w;
      stateRef.current.logicalH = h;
      kickLoop();
    };

    const drawFrame = () => {
      if (disposed || !gl || !canvas) return;
      rafId = 0;
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, Math.max(0.001, now - prevTime));
      prevTime = now;

      const s = stateRef.current;
      const ease = Math.min(1, dt * 16);
      s.hoverCurrent += (s.hoverTarget - s.hoverCurrent) * ease;
      s.pressCurrent += (s.pressTarget - s.pressCurrent) * Math.min(1, dt * 24);
      const winTarget = s.status === 'success' ? 1 : 0;
      s.winCurrent += (winTarget - s.winCurrent) * Math.min(1, dt * 10);

      const errElapsed = s.status === 'error' ? now - s.errorStartSec : -1;
      const flush =
        errElapsed >= 0 && errElapsed <= LIQUID_METAL_RIPPLE_DURATION + 0.3
          ? computeErrorFlushEnvelope(errElapsed)
          : 0;
      const rippleParam =
        errElapsed >= 0 && errElapsed <= LIQUID_METAL_RIPPLE_DURATION + 0.3 ? errElapsed : -1;

      const kx =
        s.status === 'loading'
          ? computeLoadingKeyLightX(now - s.loadingStartSec)
          : -0.42 + ((s.hitX - s.logicalW / 2) / Math.max(s.logicalW, 1)) * 0.45 * s.hoverCurrent;
      const ky = 0.72;
      const kz = 0.7;
      const kLen = Math.hypot(kx, ky, kz);

      const baseHalfW = Math.max(60, s.logicalW / 2 - 9);
      const baseHalfH = Math.max(16, s.logicalH / 2 - 8);
      const [hw, hh] = computeButtonPillHalfSize({
        baseHalfWidth: baseHalfW,
        baseHalfHeight: baseHalfH,
        pressAmount: s.pressCurrent,
        hoverAmount: s.hoverCurrent,
        errorElapsedSec: errElapsed,
      });

      gl.uniform2f(uniforms.res, canvas.width, canvas.height);
      gl.uniform2f(uniforms.center, s.logicalW / 2, s.logicalH / 2);
      gl.uniform2f(uniforms.half, hw, hh);
      gl.uniform2f(uniforms.hit, s.hitX, s.hitY);
      gl.uniform3f(uniforms.key, kx / kLen, -ky / kLen, kz / kLen);
      gl.uniform4f(uniforms.err, rippleParam, flush, s.hitX, s.hitY);
      gl.uniform1f(uniforms.scale, scale);
      gl.uniform1f(uniforms.hover, s.hoverCurrent);
      gl.uniform1f(uniforms.win, s.winCurrent);
      gl.uniform1f(uniforms.disabled, s.disabled ? 1 : 0);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      const animating =
        s.status === 'loading' ||
        (errElapsed >= 0 && errElapsed <= LIQUID_METAL_RIPPLE_DURATION + 0.3) ||
        Math.abs(s.hoverTarget - s.hoverCurrent) > 0.004 ||
        Math.abs(s.pressTarget - s.pressCurrent) > 0.004 ||
        Math.abs(winTarget - s.winCurrent) > 0.004;

      if (animating && !disposed) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    const kickLoop = () => {
      if (disposed || rafId) return;
      rafId = window.requestAnimationFrame(drawFrame);
    };
    kickLoopRef.current = kickLoop;

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    syncSize();

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
  }, [reducedMotion]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    stateRef.current.hitX = clamp01((e.clientX - rect.left) / rect.width, 0.1, 0.9) * stateRef.current.logicalW;
    stateRef.current.hitY = clamp01((e.clientY - rect.top) / rect.height, 0.2, 0.8) * stateRef.current.logicalH;
    stateRef.current.hoverTarget = disabled ? 0 : 1;
    kickLoopRef.current?.();
  };

  const displayText =
    status === 'loading'
      ? loadingLabel
      : status === 'success'
        ? successLabel
        : status === 'error'
          ? errorLabel
          : label;

  const isError = status === 'error';
  const isSuccess = status === 'success';
  const isLoading = status === 'loading';

  // CSS metallic fallback mirrors the Obsidian/Silver/Electric Cyan liquid surface when WebGL2 is unavailable or reduced motion is enabled
  const fallbackSurfaceClass = isError
    ? 'bg-gradient-to-b from-[#ff5762] via-[#d92d3a] to-[#8f1822] text-[#FFF5F6] border-[#ff8089]/60 shadow-[0_10px_28px_-10px_rgba(255,66,77,0.65)]'
    : isSuccess
      ? 'bg-gradient-to-b from-[#66e6f3] via-[#25C7D9] to-[#128997] text-[#071A1E] border-[#8CF2FC]/70 shadow-[0_12px_30px_-10px_rgba(37,199,217,0.65)]'
      : disabled
        ? 'bg-gradient-to-b from-[#2A313D] via-[#202630] to-[#161A22] text-[#B8C4D2] border-white/15 shadow-none'
        : 'bg-gradient-to-b from-[#EFF6FB] via-[#B9D4DF] to-[#4F6D7A] hover:from-[#FFFFFF] hover:via-[#9AE8F2] hover:to-[#25C7D9] text-[#0B1016] border-white/60 shadow-[0_10px_28px_-12px_rgba(37,199,217,0.5)]';

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => {
        stateRef.current.hoverTarget = disabled ? 0 : 1;
        kickLoopRef.current?.();
      }}
      onPointerLeave={() => {
        stateRef.current.hoverTarget = 0;
        stateRef.current.pressTarget = 0;
        kickLoopRef.current?.();
      }}
      onPointerDown={() => {
        if (disabled || isLoading) return;
        stateRef.current.pressTarget = 1;
        kickLoopRef.current?.();
      }}
      onPointerUp={() => {
        stateRef.current.pressTarget = 0;
        kickLoopRef.current?.();
      }}
      onPointerCancel={() => {
        stateRef.current.pressTarget = 0;
        kickLoopRef.current?.();
      }}
      className={`relative w-full h-[60px] select-none ${className}`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-200 ${
          webglReady ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <button
        type={type}
        disabled={disabled || isLoading}
        onClick={onClick}
        aria-busy={isLoading}
        className={`relative z-10 w-full h-full rounded-full px-5 font-bold text-[14.5px] tracking-[0.01em] inline-flex items-center justify-center gap-2 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-[#25C7D9] focus-visible:outline-offset-3 cursor-pointer disabled:cursor-not-allowed active:scale-[0.985] ${
          webglReady
            ? isError
              ? 'bg-transparent text-[#FFF1F2] [text-shadow:0_1px_2px_rgba(65,0,10,0.6)]'
              : disabled
                ? 'bg-transparent text-[#DCE6F0] [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]'
                : 'bg-transparent text-[#091217] [text-shadow:0_1px_0_rgba(255,255,255,0.48)]'
            : `border ${fallbackSurfaceClass}`
        }`}
      >
        {isLoading && <Loader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />}
        {isSuccess && <Check size={16} strokeWidth={2.8} className="shrink-0" aria-hidden="true" />}
        {isError && <AlertCircle size={16} className="shrink-0" aria-hidden="true" />}
        <span>{displayText}</span>
        {!isLoading && !isSuccess && !isError && children}
      </button>
    </div>
  );
};
