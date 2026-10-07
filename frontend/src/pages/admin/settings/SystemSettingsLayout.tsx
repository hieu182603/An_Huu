import { Outlet } from "react-router";

export default function SystemSettingsLayout() {
  return (
    <div className="admin-page settings-page-full">
      <Outlet />
    </div>
  );
}
