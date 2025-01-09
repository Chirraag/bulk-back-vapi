/*
  # Initial Schema Setup for Real Estate Campaign Manager

  1. New Tables
    - `campaigns`
      - `id` (uuid, primary key)
      - `name` (text)
      - `timezone` (text)
      - `start_time` (time)
      - `end_time` (time)
      - `total_contacts` (integer)
      - `contacts_called` (integer)
      - `status` (text)
      - `created_at` (timestamptz)

    - `contacts`
      - `id` (uuid, primary key)
      - `campaign_id` (uuid, foreign key)
      - `phone_number` (text)
      - `name` (text)
      - `called` (boolean)
      - `call_status` (text)
      - `called_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users
*/

-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  total_contacts integer DEFAULT 0,
  contacts_called integer DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id),
  phone_number text NOT NULL,
  name text,
  called boolean DEFAULT false,
  call_status text,
  called_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Create policies for campaigns
CREATE POLICY "Enable read access for authenticated users"
  ON campaigns
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert access for authenticated users"
  ON campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users"
  ON campaigns
  FOR UPDATE
  TO authenticated
  USING (true);

-- Create policies for contacts
CREATE POLICY "Enable read access for authenticated users"
  ON contacts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert access for authenticated users"
  ON contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users"
  ON contacts
  FOR UPDATE
  TO authenticated
  USING (true);