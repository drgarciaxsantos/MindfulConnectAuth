-- 0. Enable Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Teachers Table
CREATE TABLE IF NOT EXISTS public.teachers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  nfc_uid text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Fix: Ensure nfc_uid exists if table was already created without it
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS nfc_uid text UNIQUE;

-- 2. Clean up conflicts and Insert specific Teacher ID
-- Step A: Delete any existing row that already claims this NFC ID to prevent "duplicate key" error
DELETE FROM public.teachers WHERE nfc_uid = '04:84:c8:d1:2e:61:80';

-- Step B: Delete any existing 'Authorized Gatekeeper' to avoid duplicate names with different IDs
DELETE FROM public.teachers WHERE name = 'Authorized Gatekeeper';

-- Step C: Insert the correct record fresh
INSERT INTO public.teachers (name, nfc_uid)
VALUES ('Authorized Gatekeeper', '04:84:c8:d1:2e:61:80');

-- 3. Create Students Table
CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id_number text UNIQUE NOT NULL,
  password text NOT NULL, 
  name text NOT NULL,
  section text,
  parent_phone_number text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Fix: Ensure nfc_uid exists on students
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS nfc_uid text UNIQUE;

-- 4. Create Counselors Table
CREATE TABLE IF NOT EXISTS public.counselors (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Appointments Table
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id uuid REFERENCES public.students(id),
  student_id_number text,
  student_name text,
  section text,
  parent_phone_number text,
  has_consent boolean DEFAULT false,
  counselor_id uuid REFERENCES public.counselors(id),
  counselor_name text,
  date text,
  time text,
  reason text,
  description text,
  status text DEFAULT 'PENDING',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Add Missing Columns for Transfers and Rescheduling
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS transfer_request_to_id uuid,
ADD COLUMN IF NOT EXISTS transfer_request_to_name text,
ADD COLUMN IF NOT EXISTS transfer_counselor_accepted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS transfer_student_accepted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS reschedule_proposed_date text,
ADD COLUMN IF NOT EXISTS reschedule_proposed_time text;

-- 7. Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Create Availability Table
CREATE TABLE IF NOT EXISTS public.availability (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  counselor_id uuid REFERENCES public.counselors(id) NOT NULL,
  date text NOT NULL,
  slots jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(counselor_id, date)
);

-- 9. Insert Data
INSERT INTO public.students (student_id_number, password, name, section, parent_phone_number)
VALUES 
  ('02000385842', 'password', 'Ashly Misha C. Espina', 'MAWD-202', '0917-123-4567'),
  ('02000123456', 'password', 'Will Byers', 'STEM-101', '0917-987-6543'),
  ('02000246810', 'password', 'Viktor Hargreeves', 'MAWD-202', '0977-777-7777'),
  ('02000131313', 'password', 'Banana Joe', 'STEM-103', '0913-131-3131'),
  ('02000654321', 'password', 'Harleen Quinzel', 'HUMSS-205', '0945-678,9101'),
  ('02000111111', 'password', 'Pamela Isley', 'ABM-204', '0924-681-1012'),
  ('02000222222', 'password', 'Caitlyn Kirraman', 'MAWD-202', '0942-863-4851'),
  ('02000333333', 'password', 'Sheldon Cooper', 'STEM-101', '0956-246-9563')
ON CONFLICT (student_id_number) DO NOTHING;

INSERT INTO public.counselors (name, email)
VALUES 
  ('Ms. Christina Sharah K. Manangguit', 'wackylooky@gmail.com'),
  ('Ms. Mary Jane M. Lalamunan', 'tlga.ashlyespina@gmail.com'),
  ('Ms. Elizabeth T. Cape', 'spnashly@gmail.com')
ON CONFLICT (email) DO NOTHING;