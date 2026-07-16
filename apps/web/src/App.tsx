import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { I18nProvider } from './i18n/I18nProvider';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RequireAuth } from './auth/guards';
import { Layout } from './components/Layout';
import { LoadingPage } from './components/ui/feedback';
import { NotFound } from './pages/misc';
import {
  RomhacksList,
  RomhackDetail,
  TranslationsList,
  TranslationDetail,
  DocsList,
  DocDetail,
  ToolsList,
  ToolDetail,
  ArticlesList,
  ArticleDetail,
} from './pages/materials';

// Telas com code-split para manter o carregamento inicial leve.
const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })));
const Games = lazy(() => import('./pages/Games').then((m) => ({ default: m.Games })));
const GameDetail = lazy(() => import('./pages/GameDetail').then((m) => ({ default: m.GameDetail })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Search = lazy(() => import('./pages/Search').then((m) => ({ default: m.Search })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const AuthCallback = lazy(() => import('./pages/AuthCallback').then((m) => ({ default: m.AuthCallback })));
const SubmitRomhack = lazy(() => import('./pages/SubmitRomhack').then((m) => ({ default: m.SubmitRomhack })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const ApiDocs = lazy(() => import('./pages/ApiDocs').then((m) => ({ default: m.ApiDocs })));
const Library = lazy(() => import('./pages/Library').then((m) => ({ default: m.Library })));
const YearReview = lazy(() => import('./pages/YearReview').then((m) => ({ default: m.YearReview })));
const Users = lazy(() => import('./pages/Users').then((m) => ({ default: m.Users })));
const Stats = lazy(() => import('./pages/Stats').then((m) => ({ default: m.Stats })));
const CollectionsList = lazy(() => import('./pages/Collections').then((m) => ({ default: m.CollectionsList })));
const CollectionDetail = lazy(() => import('./pages/Collections').then((m) => ({ default: m.CollectionDetail })));

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AuthProvider>
            <ToastProvider>
              <BrowserRouter>
                <Suspense fallback={<LoadingPage />}>
                  <Routes>
                    {/* Callback de auth fica fora do layout (é só um redirecionador). */}
                    <Route path="/auth/callback" element={<AuthCallback />} />

                    <Route element={<Layout />}>
                      <Route index element={<Home />} />
                      <Route path="games" element={<Games />} />
                      <Route path="games/:slug" element={<GameDetail />} />

                      <Route path="romhacks" element={<RomhacksList />} />
                      <Route path="romhacks/:id" element={<RomhackDetail />} />
                      <Route path="translations" element={<TranslationsList />} />
                      <Route path="translations/:id" element={<TranslationDetail />} />
                      <Route path="docs" element={<DocsList />} />
                      <Route path="docs/:id" element={<DocDetail />} />
                      <Route path="tools" element={<ToolsList />} />
                      <Route path="tools/:id" element={<ToolDetail />} />
                      <Route path="articles" element={<ArticlesList />} />
                      <Route path="articles/:slug" element={<ArticleDetail />} />
                      <Route path="collections" element={<CollectionsList />} />
                      <Route path="collections/:slug" element={<CollectionDetail />} />

                      <Route path="users" element={<Users />} />
                      <Route path="stats" element={<Stats />} />
                      <Route path="u/:username" element={<Profile />} />
                      <Route path="u/:username/library" element={<Library />} />
                      <Route path="u/:username/year/:year" element={<YearReview />} />
                      <Route path="settings" element={<Settings />} />
                      <Route path="api" element={<ApiDocs />} />
                      <Route path="search" element={<Search />} />
                      <Route path="login" element={<Login />} />
                      <Route
                        path="submit"
                        element={
                          <RequireAuth>
                            <SubmitRomhack />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="admin"
                        element={
                          <RequireAuth>
                            <Admin />
                          </RequireAuth>
                        }
                      />

                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </ToastProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
