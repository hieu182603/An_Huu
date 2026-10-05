import { Component, type ReactNode } from "react";
import AppLoader from "./AppLoader";

export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: any) {
    console.error("APP_ERROR_BOUNDARY_CAUGHT:", error?.message, error?.stack, info);
  }
  render() {
    if (this.state.failed) return <AppLoader
      error="Trang chưa tải được đầy đủ. Vui lòng kết nối mạng và tải lại trang."
      onRetry={() => window.location.reload()}
    />;
    return this.props.children;
  }
}
