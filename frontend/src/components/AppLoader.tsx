import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import loadingWaves from "../assets/loading-waves.png";
import logoHorizontal from "../assets/logo.png";
import { Button, Icon } from "./ui";
import "./app-loader.css";

type LoaderProps = {
  label?: string;
  variant?: "fullscreen" | "inline";
  error?: string | null;
  onRetry?: () => void;
  /** Only supply a percentage when the caller can measure actual work completed. */
  progress?: number;
};

const LoaderContext = createContext<{
  show: (id: string, props: LoaderProps) => void;
  hide: (id: string) => void;
} | null>(null);

// The host survives auth/profile remounts and Suspense boundaries. Overlapping
// requests share one overlay, so restoring a session cannot flash two loaders.
export function AppLoadingProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<Map<string, LoaderProps>>(() => new Map());
  const show = useCallback((id: string, props: LoaderProps) => {
    setRequests(current => new Map(current).set(id, props));
  }, []);
  const hide = useCallback((id: string) => {
    setRequests(current => {
      if (!current.has(id)) return current;
      const next = new Map(current); next.delete(id); return next;
    });
  }, []);
  const value = useMemo(() => ({ show, hide }), [show, hide]);
  const pending = Array.from(requests.values());
  const current = pending.find(request => request.error) || pending[pending.length - 1];
  return <LoaderContext.Provider value={value}>
    {children}
    <AnimatePresence initial={false}>
      {current && <LoaderView key="application-loading" {...current} />}
    </AnimatePresence>
  </LoaderContext.Provider>;
}

export default function AppLoader({ label = "Vui lòng đợi trong giây lát…", variant = "fullscreen", error, onRetry, progress }: LoaderProps) {
  const host = useContext(LoaderContext);
  const requestId = useId();
  const fullscreen = variant === "fullscreen" || Boolean(error);
  useLayoutEffect(() => {
    if (!host || !fullscreen) return;
    host.show(requestId, { label, error, onRetry, progress });
    return () => host.hide(requestId);
  }, [host, fullscreen, requestId, label, error, onRetry, progress]);

  if (!fullscreen) return <div className="anhuu-page-loading" role="status" aria-live="polite" aria-busy="true">
    <div className="anhuu-page-loading__bar" aria-hidden="true" />
    <div className="anhuu-page-loading__placeholder" aria-hidden="true">
      <span /><span /><div /><div />
    </div>
    <span className="sr-only">{label}</span>
  </div>;
  return host ? null : <LoaderView label={label} error={error} onRetry={onRetry} progress={progress} />;
}

function LoaderView({ label = "Vui lòng đợi trong giây lát…", error, onRetry, progress }: LoaderProps) {
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();
  const [backgroundReady, setBackgroundReady] = useState(false);
  useEffect(() => {
    let active = true;
    const background = new Image();
    background.src = loadingWaves;
    void background.decode().then(() => { if (active) setBackgroundReady(true); }).catch(() => {
      // The solid background remains usable if the decorative image fails.
    });
    return () => { active = false; };
  }, []);
  const id = `anhuu-loading-${useId().replace(/:/g, "")}`;
  const percentage = typeof progress === "number" && Number.isFinite(progress)
    ? Math.round(Math.max(0, Math.min(100, progress))) : undefined;
  const radius = 138;
  const circumference = 2 * Math.PI * radius;
  const fraction = (percentage ?? 68) / 100;
  const tipAngle = fraction * Math.PI * 2 - Math.PI / 2;
  const tipX = 160 + radius * Math.cos(tipAngle);
  const tipY = 160 + radius * Math.sin(tipAngle);

  // Keep the screen independent of transformed route containers. An unknown
  // request duration uses a rotating arc, never an invented percentage counter.
  return createPortal(
    <motion.div className={`anhuu-loading${error ? " is-error" : ""}${percentage === undefined ? " is-indeterminate" : " is-determinate"}`}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : .24, ease: "easeOut" }}
      aria-hidden={!present || undefined} inert={!present || undefined}
      style={{ pointerEvents: present ? "auto" : "none" }}>
      <div className={`anhuu-loading__backdrop${backgroundReady ? " is-ready" : ""}`} aria-hidden="true">
        <div className="anhuu-loading__scenery" style={{ backgroundImage: `url(${loadingWaves})` }} />
        <div className="anhuu-loading__light" />
      </div>
      <div className="anhuu-loading__content">
        <img src={logoHorizontal} alt="An Hưu: Lập kế hoạch hôm nay, cho an yên ngày mai" className="anhuu-loading__logo" width={1024} height={341} fetchPriority="high" decoding="async" />
        <div className="anhuu-loading__ring"
          role={error ? undefined : "progressbar"}
          aria-label={error ? undefined : label}
          aria-valuemin={error ? undefined : 0}
          aria-valuemax={error ? undefined : 100}
          aria-valuenow={error ? undefined : percentage}>
          <div className="anhuu-loading__halo" aria-hidden="true" />
          <svg viewBox="0 0 320 320" className="anhuu-loading__svg" aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-arc`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0848ff" />
                <stop offset="42%" stopColor="#087cff" />
                <stop offset="72%" stopColor="#044beb" />
                <stop offset="100%" stopColor="#061a9e" />
              </linearGradient>
              <radialGradient id={`${id}-tip`}>
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="25%" stopColor="#c3ffff" stopOpacity=".95" />
                <stop offset="55%" stopColor="#2bdaff" stopOpacity=".5" />
                <stop offset="100%" stopColor="#00bfff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="160" cy="160" r={radius} className="anhuu-loading__track" />
            <circle cx="160" cy="160" r="155" className="anhuu-loading__satellite" stroke={`url(#${id}-arc)`} />
            <g className="anhuu-loading__orbit">
              <circle cx="160" cy="160" r={radius} className="anhuu-loading__arc anhuu-loading__arc--glow"
                stroke={`url(#${id}-arc)`} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)} />
              <circle cx="160" cy="160" r={radius} className="anhuu-loading__arc"
                stroke={`url(#${id}-arc)`} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)} />
              {fraction > .08 && [.025, .045, .065].map((distance, index) => {
                const angle = tipAngle - distance * Math.PI * 2;
                return <circle key={distance} cx={160 + radius * Math.cos(angle)} cy={160 + radius * Math.sin(angle)}
                  r={3 - index * .65} fill="#d4ffff" opacity={.8 - index * .2} />;
              })}
              {fraction > 0 && <g transform={`translate(${tipX} ${tipY})`}>
                <g className="anhuu-loading__spark">
                  <circle r="26" fill={`url(#${id}-tip)`} />
                  <circle r="5" fill="#e7ffff" />
                  <circle r="2.5" fill="#fff" />
                </g>
              </g>}
            </g>
          </svg>
          <div className="anhuu-loading__value" aria-hidden="true">
            {error ? <Icon name="shield" /> : percentage !== undefined
              ? <span className="anhuu-loading__percentage">{percentage}<span>%</span></span>
              : <><span className="anhuu-loading__waiting">Đang tải</span><span className="anhuu-loading__dots"><i /><i /><i /></span></>}
          </div>
        </div>
        <div className="anhuu-loading__message" role={error ? "alert" : "status"} aria-live="polite">
          <p>{error || label}</p>
        </div>
        {error && onRetry && <div className="anhuu-loading__retry"><Button onClick={onRetry}>Thử kết nối lại</Button></div>}
      </div>
    </motion.div>, document.body,
  );
}
