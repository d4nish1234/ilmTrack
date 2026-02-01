# IlmTrack

A mobile app for teachers and parents to manage students, homework, and attendance.

## Features

**Teachers can:**
- Sign up/sign in with email
- Create and manage classes
- Add students with parent contact info (up to 2 parents)
- Record attendance (present, absent, late, excused)
- Assign homework and track completion
- Search students quickly from the dashboard

**Parents can:**
- Sign up after receiving an email invite
- View their child's homework assignments
- View their child's attendance records
- Receive push notifications when homework is assigned

## Tech Stack

- **Frontend:** Expo (React Native) with TypeScript
- **Backend:** Firebase JS SDK (Authentication, Firestore, Cloud Functions)
- **UI:** React Native Paper
- **Navigation:** Expo Router
- **Push Notifications:** Expo Notifications + Firebase Cloud Functions

## Prerequisites

- Node.js 18+
- npm or yarn
- Expo Go app on your mobile device (for testing)
- Firebase account

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project

2. **Enable Authentication:**
   - Go to Authentication > Sign-in method
   - Enable "Email/Password" provider

3. **Create Firestore Database:**
   - Go to Firestore Database > Create database
   - Start in production mode
   - Choose your preferred region

4. **Add a Web App:**
   - Go to Project Settings > Your apps
   - Click "Add app" and select Web (`</>`)
   - Register your app (you can skip Firebase Hosting)
   - Copy the config values for the next step

### 3. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and fill in your Firebase config values:
   ```
   EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key-here
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
   EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123def456
   ```

   > **Note:** The `.env` file is gitignored for security. Never commit your actual Firebase credentials.

### 4. Deploy Firestore Security Rules

```bash
# Install Firebase CLI if you haven't
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in the project
firebase init firestore
# Select your project
# Use existing firestore.rules file

# Deploy rules
firebase deploy --only firestore:rules
```

### 5. Run the App

```bash
# Start the development server
npm run start

# Scan the QR code with Expo Go app on your phone
```

Press `i` for iOS simulator or `a` for Android emulator (if you have them set up).

## Project Structure

```
ilmTrack/
├── app/                          # Expo Router screens
│   ├── (auth)/                   # Authentication screens
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── forgot-password.tsx
│   ├── (teacher)/                # Teacher screens
│   │   ├── index.tsx             # Dashboard with class dropdown
│   │   ├── classes/
│   │   │   ├── create.tsx
│   │   │   └── [classId]/
│   │   │       └── students/
│   │   │           ├── add.tsx
│   │   │           └── [studentId]/
│   │   │               ├── homework/
│   │   │               └── attendance/
│   │   └── settings.tsx
│   ├── (parent)/                 # Parent screens
│   │   ├── index.tsx
│   │   ├── homework.tsx
│   │   ├── attendance.tsx
│   │   └── settings.tsx
│   └── _layout.tsx               # Root layout
├── src/
│   ├── components/               # Reusable UI components
│   ├── config/                   # Firebase configuration
│   ├── contexts/                 # React contexts (Auth)
│   ├── hooks/                    # Custom hooks
│   ├── services/                 # Firebase CRUD & notifications
│   ├── types/                    # TypeScript types
│   └── utils/                    # Utility functions
├── functions/                    # Firebase Cloud Functions
│   └── src/
│       └── index.ts              # Notification triggers
├── firestore.rules               # Firestore security rules
├── .env                          # Environment variables (gitignored)
└── app.json                      # Expo configuration
```

## Firebase Data Models

### Collections

- **users** - Teacher and parent profiles
- **classes** - Teacher's classes
- **students** - Students with parent info
- **homework** - Homework assignments
- **attendance** - Attendance records
- **invites** - Parent invitation tracking

## Setting Up Push Notifications

Push notifications alert parents when teachers assign new homework.

### 1. Upgrade to Firebase Blaze Plan

Cloud Functions require the Blaze (pay-as-you-go) plan. Don't worry - there's a generous free tier:
- 2 million Cloud Function invocations/month free
- 50,000 Firestore reads/day free
- Expo Push Notifications are completely free

### 2. Install Cloud Functions Dependencies

```bash
cd functions
npm install
cd ..
```

### 3. Deploy Cloud Functions

```bash
firebase deploy --only functions
```

### How It Works

1. When a parent logs in, their Expo push token is saved to Firestore
2. When a teacher creates homework, a Cloud Function triggers
3. The function looks up the student's parents and their push tokens
4. Notifications are sent via Expo's Push API

### Testing Notifications

Push notifications only work on **physical devices**, not simulators. To test:
1. Install the app on a real device via Expo Go
2. Log in as a parent
3. Have a teacher account create homework for that parent's student
4. The parent should receive a push notification

## Setting Up Parent Email Invites (Optional)

To send email invites to parents when a student is added:

### 1. Set Up Mailgun

1. Create a [Mailgun](https://www.mailgun.com) account
2. Verify your domain or use the sandbox domain for testing
3. Get your API key

### 2. Add Mailgun to Cloud Functions

```bash
cd functions
npm install mailgun-js

# Set Mailgun config
firebase functions:config:set mailgun.key="YOUR_API_KEY" mailgun.domain="YOUR_DOMAIN"
```

### 3. Deploy Functions

```bash
firebase deploy --only functions
```

## Available Scripts

```bash
# Start development server
npm run start

# Start with cache cleared
npm run start -- --clear

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Run linter
npm run lint
```

## Production Builds (EAS)

For production builds, you'll need EAS (Expo Application Services):

### Initial Setup

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to your Expo account
eas login

# Configure your project (creates eas.json)
eas build:configure
```

### Building for iOS

```bash
# Development build (for testing on device)
eas build --profile development --platform ios

# Production build (for App Store)
eas build --profile production --platform ios

# Submit to App Store
eas submit --platform ios
```

**Requirements for iOS:**
- Apple Developer account ($99/year)
- App Store Connect access
- EAS will guide you through Apple authentication

### Building for Android

```bash
# Development build (for testing on device)
eas build --profile development --platform android

# Production build (for Play Store)
eas build --profile production --platform android

# Submit to Play Store
eas submit --platform android
```

**Requirements for Android:**
- Google Play Console account ($25 one-time)
- For Play Store submission: create a service account key

### Build Both Platforms

```bash
# Build for both iOS and Android
eas build --profile production --platform all
```

### Common EAS Prompts

During your first build, EAS may ask:

| Prompt | Answer |
|--------|--------|
| "Install expo-dev-client?" | **No** for production builds, **Yes** for development builds |
| "Generate a new Android Keystore?" | **Yes** (EAS manages it for you) |
| "Log in to Apple Developer?" | Follow the prompts to authenticate |

## Troubleshooting

### "Firebase: Error (auth/api-key-not-valid)"
Make sure your `.env` file has the correct Firebase config values. After updating `.env`, restart Metro with cache cleared:
```bash
npm run start -- --clear
```

### "Missing Firestore index"
When you see index errors in the console, click the link provided to create the required composite index in Firebase Console.

### Environment variables not loading
- Ensure your `.env` file is in the project root
- Variable names must start with `EXPO_PUBLIC_` to be accessible in the app
- Restart Metro with `--clear` flag after changing `.env`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT
