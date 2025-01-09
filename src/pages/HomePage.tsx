import React, { useEffect, useState } from 'react';
import { BarChart, Phone, Users, Clock } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { Campaign } from '../types';

function HomePage() {
  const [metrics, setMetrics] = useState({
    totalCalls: 0,
    activeCampaigns: 0,
    totalContacts: 0,
    successRate: 0,
  });

  useEffect(() => {
    async function fetchMetrics() {
      const campaignsSnapshot = await getDocs(collection(db, 'campaigns'));
      const contactsSnapshot = await getDocs(collection(db, 'contacts'));
      
      const campaigns = campaignsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Campaign[];
      const contacts = contactsSnapshot.docs.map(doc => doc.data());
      
      const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
      const calledContacts = contacts.filter(c => c.called).length;
      
      setMetrics({
        totalCalls: calledContacts,
        activeCampaigns,
        totalContacts: contacts.length,
        successRate: contacts.length ? (calledContacts / contacts.length) * 100 : 0,
      });
    }

    fetchMetrics();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard Overview</h1>
      
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Calls Made"
          value={metrics.totalCalls}
          icon={<Phone className="h-5 w-5 text-indigo-600" />}
        />
        <MetricCard
          title="Active Campaigns"
          value={metrics.activeCampaigns}
          icon={<BarChart className="h-5 w-5 text-green-600" />}
        />
        <MetricCard
          title="Total Contacts"
          value={metrics.totalContacts}
          icon={<Users className="h-5 w-5 text-blue-600" />}
        />
        <MetricCard
          title="Success Rate"
          value={`${metrics.successRate.toFixed(1)}%`}
          icon={<Clock className="h-5 w-5 text-yellow-600" />}
        />
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon }: { title: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-100">
      <div className="p-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">{icon}</div>
          <div className="ml-4 w-0 flex-1">
            <dl>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</dt>
              <dd className="text-lg font-semibold text-gray-900 mt-1">{value}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;