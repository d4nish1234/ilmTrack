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

## Tech Stack

- **Frontend:** Expo (React Native) with TypeScript
- **Backend:** Firebase (Authentication, Firestore, Cloud Functions)
- **UI:** React Native Paper
- **Navigation:** Expo Router

## Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- Firebase account
- Apple Developer account (for iOS builds)
- Google Play Console account (for Android builds)

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

4. **Download config files:**
   - Go to Project Settings > Your apps
   - Add an iOS app (bundle ID: `com.danishmahboob.ilmtrack`)
   - Download `GoogleService-Info.plist` and place it in the project root
   - Add an Android app (package name: `com.danishmahboob.ilmtrack`)
   - Download `google-services.json` and place it in the project root

   > **Note:** These files are gitignored for security. You'll need to set up EAS environment variables for cloud builds (see step 4).

### 3. Deploy Firestore Security Rules

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

### 4. Create Development Build

Since this app uses native Firebase modules, you need a development build (not Expo Go).

```bash
# Login to EAS
eas login

# Configure your project (first time only)
eas build:configure

# Upload Firebase config files as EAS environment variables (required for cloud builds)
eas env:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
eas env:create --scope project --name GOOGLE_SERVICES_PLIST --type file --value ./GoogleService-Info.plist

# Build for iOS Simulator
eas build --profile development --platform ios

# OR build for Android Emulator
eas build --profile development --platform android
```

### 5. Run the App

After the build completes:

```bash
# Start the development server
npx expo start --dev-client

# Press 'i' for iOS or 'a' for Android
```

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
│   ├── services/                 # Firebase CRUD operations
│   ├── types/                    # TypeScript types
│   └── utils/                    # Utility functions
├── firestore.rules               # Firestore security rules
├── eas.json                      # EAS Build configuration
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

## Setting Up Parent Email Invites (Optional)

To send email invites to parents when a student is added:

### 1. Set Up Mailgun

1. Create a [Mailgun](https://www.mailgun.com) account
2. Verify your domain or use the sandbox domain for testing
3. Get your API key

### 2. Create Cloud Functions

```bash
# Navigate to functions directory
mkdir functions && cd functions

# Initialize
npm init -y
npm install firebase-functions firebase-admin mailgun-js

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
npx expo start --dev-client

# Run on iOS simulator
npx expo start --dev-client --ios

# Run on Android emulator
npx expo start --dev-client --android

# Build for development
eas build --profile development --platform all

# Build for production
eas build --profile production --platform all

# Submit to app stores
eas submit --platform ios
eas submit --platform android

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Run TypeScript check
npx tsc --noEmit

# Run linter
npm run lint
```

## Troubleshooting

### "Firebase app not initialized"
Make sure `google-services.json` and `GoogleService-Info.plist` are in the project root and you've created a new development build.

### "Missing Firestore index"
When you see index errors in the console, click the link provided to create the required composite index in Firebase Console.

### Build fails on EAS
- Ensure you have the correct bundle ID/package name in `app.json`
- Check that Firebase config files are not in `.gitignore` if building on EAS servers

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT
