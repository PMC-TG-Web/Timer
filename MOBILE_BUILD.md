# Seafood Boil Timer - Mobile Build Instructions

This app is now a Capacitor-based mobile app with native local notifications that work when the phone screen is off.

## Prerequisites

- **Node.js & npm** (already installed)
- **For Android:**
  - Android Studio with Android SDK
  - Java Development Kit (JDK) 11+
  - Gradle
- **For iOS:**
  - Mac with Xcode 12+
  - CocoaPods

## Quick Start

### 1. Build the web assets (required first)

```bash
npm run build
```

### 2. Add Android Platform (for Android phones)

```bash
npx cap add android
npx cap copy android
npx cap open android
```

This opens Android Studio. Build and run directly from there to your phone or emulator.

### 3. Add iOS Platform (for iPhones - Mac only)

```bash
npx cap add ios
npx cap copy ios
npx cap open ios
```

This opens Xcode. Build and run from there to your phone or simulator.

## How It Works

- **On mobile:** When you start the timer, native notifications are scheduled for each drop time. Even if the screen locks or you switch apps, you'll get local notifications at the exact drop-in time.
- **On web:** The app still works but relies on browser notifications (less reliable if the browser is backgrounded).

## Daily Development Workflow

After making changes to the web code:

```bash
npm run build
npx cap sync  # Syncs dist changes to both android/ and ios/
```

Then rebuild in Android Studio or Xcode.

## Notes

- Notifications will appear as system notifications on Android and iOS, even with the screen off.
- The timer continues running in the background using real clock time (not browser timers).
- All your timer items and settings are saved in local storage and restored on app relaunch.
