# NFC Verification System

This document outlines the architecture, database requirements, and security practices for the Gatekeeper NFC App.

## 1. System Architecture

1.  **Teacher App (This Codebase):**
    *   Acts as a "dumb terminal" with logic.
    *   Authenticates Teacher via NFC.
    *   Reads Student NFC.
    *   Queries Supabase for validity.
    *   Triggers Notification.
    *   **Crucially:** Subscribes to Supabase Realtime changes on the specific `appointments` row to update UI instantly when a counselor clicks "Accept" on their dashboard.

2.  **Supabase:**
    *   Central source of truth.
    *   Handles Realtime broadcasting.
    *   Stores pending verification requests via `notifications` table.

3.  **Counselor Dashboard (Existing):**
    *   Receives the notification.
    *   Updates the `appointments` table status to `ACCEPTED` or `DENIED`.

## 2. Database Updates (Required)

You must run the following SQL to enable the NFC features. This creates a `teachers` table and adds NFC UID columns.

```sql
-- Create Teachers Table (Verifiers)
CREATE TABLE IF NOT EXISTS public.teachers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  nfc_uid text UNIQUE NOT NULL, -- Store the Serial or Payload Text here
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add NFC UID to Students
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS nfc_uid text UNIQUE;

-- Enable Realtime for Appointments (if not already enabled)
-- In Supabase Dashboard: Replication > Source > public.appointments > Enable
```

### Sample Data for Testing

```sql
INSERT INTO public.teachers (name, nfc_uid)
VALUES ('Mr. Guard Checkerson', 'TEACHER_TAG_001');

-- Update a student with a dummy NFC ID
UPDATE public.students 
SET nfc_uid = 'STUDENT_TAG_001' 
WHERE student_id_number = '02000385842'; 
```

## 3. NFC Implementation Details

### UID Source
The code supports two methods of reading tags:

1.  **Payload (Recommended):** The tag contains a standard NDEF Text Record (e.g., "02000385842").
    *   *Why?* Web NFC privacy features often randomize the hardware `serialNumber` to prevent tracking. Writing the Student ID to the tag as data is more reliable for web apps.
2.  **Serial Number:** The hardware ID of the chip.
    *   *Note:* May not work consistently on all Android devices due to privacy masking.

### "Invalid Student Token" Causes & Fixes

1.  **Randomized UID:** Android phones may randomize the UID every time it's scanned.
    *   *Fix:* Do not rely on `serialNumber`. Write the Student ID Number as a Text Record onto the NFC tag using an NFC Tools app.
2.  **Browser Permissions:** The user denied NFC permissions.
    *   *Fix:* Ensure the site is served over **HTTPS** (localhost is fine for dev). The user must click "Allow" when prompted.
3.  **Tag Technology:** The tag is not NDEF formatted.
    *   *Fix:* Format tags using NDEF (standard for web/mobile).

## 4. Security Best Practices

1.  **HTTPS is Mandatory:** Web NFC API does not exist on HTTP.
2.  **No PIN/Password:** This system prioritizes speed. Security relies on the physical possession of the Teacher's NFC badge.
3.  **Short-lived Sessions:** The app does not persist the Teacher's login deeply. Refreshing the page requires re-tapping the teacher badge.
4.  **Audit Logs:** Every successful verification inserts a record into `notifications`, effectively acting as a log of who attempted to enter and when.
