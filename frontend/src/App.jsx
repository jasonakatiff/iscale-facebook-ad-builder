/**
 * Facebook Ad Builder - Frontend
 *
 * Created by Jason Akatiff
 * iSCALE.com | A4D.com
 * Telegram: @jasonakatiff
 * Email: jason@jasonakatiff.com
 */

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { BrandProvider } from './context/BrandContext';
import { CampaignProvider } from './context/CampaignContext';
import { ToastProvider } from './context/ToastContext';
import PrivateRoute from './components/PrivateRoute';
import { InstallationProvider } from './context/InstallationContext';
import { InstallationGate } from './components/InstallationGate';
import { InstallationSetup } from './pages/InstallationSetup';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CreateAds from './pages/CreateAds';
import ImageAds from './pages/ImageAds';
import VideoAds from './pages/VideoAds';
import Reporting from './pages/Reporting';
import { PostingQueue } from './pages/PostingQueue';
import Brands from './pages/Brands';
import Products from './pages/Products';
import CustomerProfiles from './pages/CustomerProfiles';
import FacebookCampaigns from './pages/FacebookCampaigns';
import WinningAds from './pages/WinningAds';
import GeneratedAds from './pages/GeneratedAds';
import Research from './pages/Research';
import ResearchSettings from './pages/ResearchSettings';
import BrandScrapes from './pages/BrandScrapes';
import AdRemix from './pages/AdRemix';
import Settings from './pages/Settings';
import Connections from './pages/Connections';
import LeadRouter from './pages/LeadRouter';
import ApiKeys from './pages/ApiKeys';
import { Telemetry } from './pages/Telemetry';
import Help from './pages/Help';
import Themes from './pages/Themes';
import Plugins from './pages/Plugins';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import GoogleAdsCampaigns from './pages/GoogleAdsCampaigns';
import Overview from './pages/Overview';
import TikTokAdsCampaigns from './pages/TikTokAdsCampaigns';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
    <ToastProvider>
      <AuthProvider>
        <BrandProvider>
          <CampaignProvider>
            <BrowserRouter>
              <InstallationProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                {/* Protected routes */}
                <Route
                  path="/"
                  element={
                    <PrivateRoute>
                      <InstallationGate><Layout /></InstallationGate>
                    </PrivateRoute>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="setup" element={<InstallationSetup />} />
                  <Route path="overview" element={<Overview />} />
                  <Route path="research" element={<Research />} />
                  <Route path="research/brand-scrapes" element={<BrandScrapes />} />
                  <Route path="research/settings" element={<ResearchSettings />} />
                  <Route path="build-creatives" element={<CreateAds />} />
                  <Route path="image-ads" element={<ImageAds />} />
                  <Route path="video-ads" element={<VideoAds />} />
                  <Route path="facebook-campaigns" element={<FacebookCampaigns />} />
                  <Route path="google-ads" element={<GoogleAdsCampaigns />} />
                  <Route path="tiktok-ads" element={<TikTokAdsCampaigns />} />
                  <Route path="winning-ads" element={<WinningAds />} />
                  <Route path="generated-ads" element={<GeneratedAds />} />
                  <Route path="brands" element={<Brands />} />
                  <Route path="products" element={<Products />} />
                  <Route path="profiles" element={<CustomerProfiles />} />
                  <Route path="ad-remix" element={<AdRemix />} />
                  <Route path="posting-queue" element={<PostingQueue />} />
                  <Route path="reporting" element={<Reporting />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="connections" element={<Connections />} />
                  <Route path="settings/leadrouter" element={<LeadRouter />} />
                  <Route path="settings/api-keys" element={<ApiKeys />} />
                  <Route path="telemetry" element={<PrivateRoute requiredRole="admin"><Telemetry /></PrivateRoute>} />
                  <Route path="help" element={<Help />} />
                  <Route path="themes" element={<Themes />} />
                  <Route path="plugins" element={<Plugins />} />
                  <Route
                    path="users"
                    element={
                      <PrivateRoute requiredRole="admin">
                        <UserManagement />
                      </PrivateRoute>
                    }
                  />
                </Route>
              </Routes>
            </InstallationProvider>
            </BrowserRouter>
          </CampaignProvider>
        </BrandProvider>
      </AuthProvider>
    </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
