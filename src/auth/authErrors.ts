import { FirebaseError } from 'firebase/app';

const authErrorMessages: Record<string, string> = {
  'auth/account-exists-with-different-credential':
    'An account already exists with this email using a different sign-in method.',
  'auth/email-already-in-use': 'An account already exists with this email address.',
  'auth/invalid-credential': 'The email or password you entered is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/network-request-failed': 'Unable to reach the authentication service. Check your connection and try again.',
  'auth/operation-not-allowed': 'This sign-in method is not currently enabled.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow popups and try again.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled before it finished.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment before trying again.',
  'auth/user-disabled': 'This account has been disabled. Contact GOATLAND support for help.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
};

export function getAuthErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    return authErrorMessages[error.code] ?? 'Authentication failed. Please try again.';
  }

  return 'Something went wrong. Please try again.';
}
