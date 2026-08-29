import { Route, Routes } from 'react-router-dom';
import { RootLayout } from './components/RootLayout';
import { PlayerProfileGate } from './components/PlayerProfileGate';
import { ContactPage } from './pages/ContactPage';
import { CheckoutReturnPage } from './pages/CheckoutReturnPage';
import { GameDetailPage } from './pages/GameDetailPage';
import { GamesPage } from './pages/GamesPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { HomePage } from './pages/HomePage';
import { LeaguesPage } from './pages/LeaguesPage';
import { LogInPage } from './pages/LogInPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PlayerProgressionPage } from './pages/PlayerProgressionPage';
import { RulesPage } from './pages/RulesPage';
import { RegistrationPage } from './pages/RegistrationPage';
import { SocialMediaPage } from './pages/SocialMediaPage';
import { SignUpPage } from './pages/SignUpPage';
import { TournamentsPage } from './pages/TournamentsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<HomePage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="player-progression" element={<PlayerProgressionPage />} />
        <Route path="leagues" element={<LeaguesPage />} />
        <Route path="tournaments" element={<TournamentsPage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="games/madden" element={<GameDetailPage gameId="madden" />} />
        <Route
          path="games/college-football"
          element={<GameDetailPage gameId="college-football" />}
        />
        <Route path="games/nba-2k" element={<GameDetailPage gameId="nba-2k" />} />
        <Route path="games/call-of-duty" element={<GameDetailPage gameId="call-of-duty" />} />
        <Route path="games/mlb-27" element={<GameDetailPage gameId="mlb-27" />} />
        <Route path="social-media" element={<SocialMediaPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="signup" element={<SignUpPage />} />
        <Route path="login" element={<LogInPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route element={<PlayerProfileGate />}>
          <Route path="register" element={<RegistrationPage />} />
          <Route path="checkout/success" element={<CheckoutReturnPage mode="success" />} />
          <Route path="checkout/cancel" element={<CheckoutReturnPage mode="cancel" />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
