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
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CreateAds from './pages/CreateAds';
import ImageAds from './pages/ImageAds';
import Wizard from './components/Wizard';
import VideoAds from './pages/VideoAds';
import Reporting from './pages/Reporting';
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
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import GoogleAdsCampaigns from './pages/GoogleAdsCampaigns';

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrandProvider>
          <CampaignProvider>
            <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />

                {/* Protected routes */}
                <Route
                  path="/"
                  element={
                    <PrivateRoute>
                      <Layout />
                    </PrivateRoute>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="research" element={<Research />} />
                  <Route path="research/brand-scrapes" element={<BrandScrapes />} />
                  <Route path="research/settings" element={<ResearchSettings />} />
                  <Route path="build-creatives" element={<CreateAds />} />
                  <Route path="image-ads" element={<ImageAds />} />
                  <Route path="video-ads" element={<VideoAds />} />
                  <Route path="facebook-campaigns" element={<FacebookCampaigns />} />
                  <Route path="google-ads" element={<GoogleAdsCampaigns />} />
                  <Route path="winning-ads" element={<WinningAds />} />
                  <Route path="generated-ads" element={<GeneratedAds />} />
                  <Route path="brands" element={<Brands />} />
                  <Route path="products" element={<Products />} />
                  <Route path="profiles" element={<CustomerProfiles />} />
                  <Route path="ad-remix" element={<AdRemix />} />
                  <Route path="reporting" element={<Reporting />} />
                  <Route path="settings" element={<Settings />} />
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
            </BrowserRouter>
          </CampaignProvider>
        </BrandProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
