import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();

function emulatorHost(value: unknown): string {
  const host = typeof value === 'string' && value ? value : '127.0.0.1';
  const hostLabel = '[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?';
  if (!new RegExp(`^(?:localhost|${hostLabel}(?:\\.${hostLabel})*)$`).test(host)) {
    throw new Error('Invalid Firebase emulator host.');
  }
  return host;
}

function emulatorPort(value: unknown, fallback: number): number {
  const raw = typeof value === 'string' && value ? value : String(fallback);
  if (!/^\d+$/.test(raw)) throw new Error('Invalid Firebase emulator port.');
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Invalid Firebase emulator port.');
  }
  return port;
}

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  const host = emulatorHost(import.meta.env.VITE_FIREBASE_EMULATOR_HOST);
  const authPort = emulatorPort(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT, 9099);
  const firestorePort = emulatorPort(import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT, 8080);
  const functionsPort = emulatorPort(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT, 5001);

  connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, firestorePort);
  connectFunctionsEmulator(functions, host, functionsPort);
}
