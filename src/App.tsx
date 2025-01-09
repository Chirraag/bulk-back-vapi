import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Home, Building2 } from 'lucide-react';
import HomePage from './pages/HomePage';
import CampaignsPage from './pages/CampaignsPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between h-14">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <Building2 className="h-6 w-6 text-indigo-600" />
                  <span className="ml-2 text-lg font-semibold text-gray-900">Think Realty</span>
                </div>
                <div className="hidden sm:ml-8 sm:flex sm:space-x-6">
                  <Link
                    to="/"
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-700 hover:text-indigo-600 border-b-2 border-transparent hover:border-indigo-600"
                  >
                    <Home className="h-4 w-4 mr-1" />
                    Home
                  </Link>
                  <Link
                    to="/campaigns"
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-700 hover:text-indigo-600 border-b-2 border-transparent hover:border-indigo-600"
                  >
                    <Building2 className="h-4 w-4 mr-1" />
                    Campaigns
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;