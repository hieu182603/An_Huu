import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function useMarketingMotion() {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.mk-hero-card', { y: 28, duration: 1, stagger: 0.12, ease: 'power3.out' });
      gsap.utils.toArray<HTMLElement>('.mk-reveal').forEach(element => {
        gsap.from(element, { y: 26, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: element, start: 'top 94%', once: true } });
      });
      gsap.fromTo('.mk-journey-photo img', { scale: 1.08 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.mk-journey-photo', start: 'top bottom', end: 'bottom top', scrub: 1 } });
      gsap.to('.mk-hero-cards', { y: 28, ease: 'none', scrollTrigger: { trigger: '.mk-hero', start: 'top top', end: 'bottom top', scrub: 1 } });
    });
    return () => media.revert();
  }, { scope });
  return scope;
}
