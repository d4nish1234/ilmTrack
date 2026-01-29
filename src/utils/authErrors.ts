/**
 * Translates Firebase Auth error codes to user-friendly messages
 */
export function getAuthErrorMessage(error: { code?: string; message?: string }): string {
  const errorCode = error.code || '';

  switch (errorCode) {
    // Sign In Errors
    case 'auth/user-not-found':
      return 'No account found with this email. Please check the email or sign up.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please check your credentials.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes before trying again.';

    // Sign Up Errors
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters with a mix of letters and numbers.';
    case 'auth/operation-not-allowed':
      return 'Account creation is currently disabled. Please try again later.';

    // Password Reset Errors
    case 'auth/expired-action-code':
      return 'This password reset link has expired. Please request a new one.';
    case 'auth/invalid-action-code':
      return 'This password reset link is invalid. Please request a new one.';

    // Network Errors
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection and try again.';

    // Credential Errors
    case 'auth/requires-recent-login':
      return 'Please sign out and sign in again to complete this action.';

    // Generic Errors
    case 'auth/internal-error':
      return 'An unexpected error occurred. Please try again.';

    default:
      // Log unknown errors for debugging
      console.warn('Unknown auth error:', errorCode, error.message);

      // Check if there's a readable message from Firebase
      if (error.message && !error.message.includes('Firebase')) {
        return error.message;
      }

      return 'Something went wrong. Please try again.';
  }
}
