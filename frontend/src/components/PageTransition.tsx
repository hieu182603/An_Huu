import { useEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

// Mount inside the route's Suspense boundary, after the actual page is ready.
// No outgoing page is retained: forms and route context have one live owner.
export default function PageTransition({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const heading = container.current?.querySelector<HTMLElement>("h1");
    heading?.setAttribute("tabindex", "-1");
    // A lazy page may finish mounting after the user has opened a header menu
    // or started typing. Preserve that interaction instead of stealing focus.
    const focused = document.activeElement;
    const interacting = focused instanceof HTMLElement && focused.closest('button,input,textarea,select,[contenteditable="true"],[role="menu"],[role="dialog"]');
    if (!interacting) heading?.focus({ preventScroll: true });
  }, []);
  return <motion.div ref={container} className="anhuu-page-transition"
    initial={reducedMotion ? false : { opacity: .65, y: 5 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: reducedMotion ? 0 : .18, ease: [.22, 1, .36, 1] }}>
    {children}
  </motion.div>;
}
