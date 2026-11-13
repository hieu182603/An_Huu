import { createElement, lazy, useState, type ComponentProps, type ComponentType } from "react";

// A lazy route whose chunk can be fetched ahead of time. React.lazy always
// suspends on its first render, even when the module is already downloaded,
// and React then keeps the Suspense fallback on screen for ~300 ms. Once
// preload() has finished, the component renders directly instead, so a
// preloaded page appears without passing through the loader.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any component's props
export function lazyRoute<C extends ComponentType<any>>(load: () => Promise<{ default: C }>) {
  let loaded: C | null = null;
  let pending: Promise<void> | null = null;
  const preload = () => pending ??= load().then(module => { loaded = module.default; }, () => { pending = null; });
  const Lazy = lazy(load);
  function Route(props: ComponentProps<C>) {
    // Decided once per mount: switching component type later would remount the page.
    const [Component] = useState(() => (loaded ?? Lazy) as ComponentType<ComponentProps<C>>);
    return createElement(Component, props);
  }
  return Object.assign(Route, { preload });
}
