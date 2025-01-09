import React, { useState, useEffect } from 'react';
import { parse } from 'papaparse';
import { Plus, Building2, X, Download } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, orderBy, query, writeBatch } from 'firebase/firestore';
import type { Campaign } from '../types';

function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showNewCampaign, setShowNewCampaign] = useState(false);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function fetchCampaigns() {
    const campaignsQuery = query(collection(db, 'campaigns'), orderBy('created_at', 'desc'));
    const snapshot = await getDocs(campaignsQuery);
    const campaignsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Campaign[];
    setCampaigns(campaignsData);
  }

  function downloadTemplate() {
    const csvContent = "phone_number,name\n+1234567890,John Doe\n+0987654321,Jane Smith";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold text-gray-900">Campaign Management</h1>
        <div className="flex gap-2">
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Download className="h-4 w-4 mr-1" />
            Download Template
          </button>
          <button
            onClick={() => setShowNewCampaign(true)}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Campaign
          </button>
        </div>
      </div>

      {showNewCampaign && (
        <NewCampaignForm
          onClose={() => setShowNewCampaign(false)}
          onSuccess={() => {
            setShowNewCampaign(false);
            fetchCampaigns();
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            onUpdate={fetchCampaigns}
          />
        ))}
      </div>
    </div>
  );
}

function NewCampaignForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    timezone: '',
    startTime: '',
    endTime: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    
    if (!file) {
      setError('Please select a CSV file');
      setIsSubmitting(false);
      return;
    }

    try {
      // Create campaign first
      const campaign = {
        name: formData.name,
        timezone: formData.timezone,
        start_time: formData.startTime,
        end_time: formData.endTime,
        campaign_date: formData.date,
        status: 'active',
        total_contacts: 0,
        contacts_called: 0,
        created_at: new Date().toISOString(),
      };

      const campaignRef = await addDoc(collection(db, 'campaigns'), campaign);

      // Parse and validate CSV
      parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            if (results.errors.length > 0) {
              throw new Error('CSV parsing failed: ' + results.errors[0].message);
            }

            const validContacts = results.data.filter((row: any) => 
              row.phone_number && 
              typeof row.phone_number === 'string' && 
              row.phone_number.trim() !== ''
            );

            if (validContacts.length === 0) {
              throw new Error('No valid contacts found in CSV file');
            }

            // Process contacts in batches of 500
            const batchSize = 500;
            const batches = [];
            
            for (let i = 0; i < validContacts.length; i += batchSize) {
              const batch = writeBatch(db);
              const batchContacts = validContacts.slice(i, i + batchSize);
              
              batchContacts.forEach((row: any) => {
                // Create contact in the campaign's contacts subcollection
                const contactRef = doc(collection(db, `campaigns/${campaignRef.id}/contacts`));
                batch.set(contactRef, {
                  phone_number: row.phone_number.trim(),
                  name: row.name?.trim() || '',
                  called: false,
                  created_at: new Date().toISOString(),
                });
              });
              
              batches.push(batch);
            }

            // Commit all batches
            await Promise.all(batches.map(batch => batch.commit()));

            // Update campaign with total contacts
            await updateDoc(doc(db, 'campaigns', campaignRef.id), {
              total_contacts: validContacts.length
            });

            onSuccess();
          } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to process contacts');
            setIsSubmitting(false);
          }
        },
        error: (error: Error) => {
          setError(`Failed to parse CSV: ${error.message}`);
          setIsSubmitting(false);
        },
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create campaign');
      setIsSubmitting(false);
    }
  }

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">New Campaign</h2>
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Campaign Name
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Campaign Date
            </label>
            <input
              type="date"
              required
              min={minDate}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Timezone
            </label>
            <select
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              disabled={isSubmitting}
            >
              <option value="">Select timezone</option>
              <option value="Asia/Dubai">UAE Time (Gulf Standard Time)</option>
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Chicago">Central Time</option>
              <option value="America/Denver">Mountain Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Start Time
              </label>
              <input
                type="time"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                End Time
              </label>
              <input
                type="time"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Contact List (CSV)
            </label>
            <input
              type="file"
              accept=".csv"
              required
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500">
              CSV must include phone_number and name columns. Download the template for the correct format.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating Campaign...' : 'Create Campaign'}
          </button>
        </form>
      </div>
    </div>
  );
}

function CampaignCard({ campaign, onUpdate }: { campaign: Campaign; onUpdate: () => void }) {
  async function handleEndCampaign() {
    const campaignRef = doc(db, 'campaigns', campaign.id);
    await updateDoc(campaignRef, { status: 'ended' });
    onUpdate();
  }

  const progress = campaign.total_contacts > 0
    ? (campaign.contacts_called / campaign.total_contacts) * 100
    : 0;

  return (
    <div className="bg-white shadow-sm rounded-lg border border-gray-100 p-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-sm font-medium text-gray-900">{campaign.name}</h3>
          <p className="text-xs text-gray-500 mt-1">{campaign.timezone}</p>
          {campaign.campaign_date && (
            <p className="text-xs text-gray-500">
              Date: {new Date(campaign.campaign_date).toLocaleDateString()}
            </p>
          )}
        </div>
        {campaign.status === 'active' && (
          <button
            onClick={handleEndCampaign}
            className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-red-700 bg-red-50 hover:bg-red-100"
          >
            End Campaign
          </button>
        )}
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Progress</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-4 text-center">
        <div className="border-r border-gray-100">
          <dt className="text-xs font-medium text-gray-500">Total Contacts</dt>
          <dd className="mt-1 text-sm font-semibold text-gray-900">
            {campaign.total_contacts}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500">Calls Made</dt>
          <dd className="mt-1 text-sm font-semibold text-gray-900">
            {campaign.contacts_called}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default CampaignsPage;