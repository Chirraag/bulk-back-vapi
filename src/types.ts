export interface Campaign {
  id: string;
  name: string;
  timezone: string;
  start_time: string;
  end_time: string;
  total_contacts: number;
  contacts_called: number;
  status: 'active' | 'ended';
  created_at: string;
}

export interface Contact {
  id: string;
  campaign_id: string;
  phone_number: string;
  name?: string;
  called: boolean;
  call_status?: string;
  called_at?: string;
}