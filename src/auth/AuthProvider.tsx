import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { CURRENT_RULES_VERSION } from '../config/rules';
import { auth, db, googleProvider } from "../lib/firebase";
import type { CreatePlayerInput, Player } from '../models/Player';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  player: Player | null;
  playerLoading: boolean;
  playerError: string | null;
  signUp: (email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  createPlayer: (input: CreatePlayerInput) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setPlayer(null);
      setPlayerLoading(false);
      setPlayerError(null);
      return;
    }

    setPlayerLoading(true);
    setPlayerError(null);

    return onSnapshot(
      doc(db, 'players', user.uid),
      (snapshot) => {
        const data = snapshot.data();
        setPlayer(snapshot.exists() && data?.profileComplete === true ? (data as Player) : null);
        setPlayerLoading(false);
        setPlayerError(null);
      },
      () => {
        setPlayer(null);
        setPlayerLoading(false);
        setPlayerError('We could not load your GOATLAND player profile. Please try again.');
      },
    );
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      player,
      playerLoading,
      playerError,
      signUp: async (email: string, password: string) => {
        await createUserWithEmailAndPassword(auth, email, password);
      },
      logIn: async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      signInWithGoogle: async () => {
        await signInWithPopup(auth, googleProvider);
      },
      logOut: async () => {
        await signOut(auth);
      },
      resetPassword: async (email: string) => {
        await sendPasswordResetEmail(auth, email);
      },
      createPlayer: async ({ displayName, dateOfBirth, state }: CreatePlayerInput) => {
        if (!user?.email) {
          throw new Error('A verified account email is required to create a player profile.');
        }

        const timestamp = serverTimestamp();
        await setDoc(doc(db, 'players', user.uid), {
          displayName: displayName.trim(),
          email: user.email,
          dateOfBirth,
          state,
          accountStatus: 'active',
          profileComplete: true,
          rulesVersionAccepted: CURRENT_RULES_VERSION,
          rulesAcceptedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      },
    }),
    [user, loading, player, playerLoading, playerError]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// The hook lives with its context so consumers have one auth entry point.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
