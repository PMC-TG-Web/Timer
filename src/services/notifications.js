import { LocalNotifications } from '@capacitor/local-notifications';

// Check if we're running in Capacitor (mobile) or web
const isCapacitor = () => {
  return typeof window !== 'undefined' && window.capacitor !== undefined;
};

// Request notification permissions on mobile
export async function requestNotificationPermission() {
  if (!isCapacitor()) return true; // Web always works

  try {
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  } catch {
    return false;
  }
}

// Schedule a notification at a specific time (delay in seconds)
export async function scheduleNotification(id, title, body, delaySeconds) {
  if (!isCapacitor()) return; // Web app doesn't use this

  try {
    const delayMs = delaySeconds * 1000;
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          schedule: {
            at: new Date(Date.now() + delayMs),
          },
        },
      ],
    });
  } catch (error) {
    console.error('Failed to schedule notification:', error);
  }
}

// Cancel a scheduled notification
export async function cancelNotification(id) {
  if (!isCapacitor()) return;

  try {
    await LocalNotifications.cancel({
      notifications: [{ id }],
    });
  } catch (error) {
    console.error('Failed to cancel notification:', error);
  }
}

// Cancel all notifications
export async function cancelAllNotifications() {
  if (!isCapacitor()) return;

  try {
    await LocalNotifications.cancelAll();
  } catch (error) {
    console.error('Failed to cancel all notifications:', error);
  }
}
