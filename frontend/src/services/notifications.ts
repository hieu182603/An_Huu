import { authenticatedRequest } from "./api";

export interface NotificationSettings {
  revision: number;
  emailDigest: boolean;
  goalAlerts: boolean;
  partnerUpdates: boolean;
  deliveryAvailable: {
    emailDigest: boolean;
    goalAlerts: boolean;
    partnerUpdates: boolean;
  };
  securityAndSupportRequired: boolean;
}

export interface UpdateNotificationSettingsInput {
  expectedRevision: number;
  emailDigest: boolean;
  goalAlerts: boolean;
  partnerUpdates: boolean;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return authenticatedRequest<NotificationSettings>("/me/notification-settings");
}

export async function updateNotificationSettings(input: UpdateNotificationSettingsInput): Promise<NotificationSettings> {
  return authenticatedRequest<NotificationSettings>("/me/notification-settings", input, "PUT");
}
