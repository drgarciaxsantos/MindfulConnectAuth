export interface Student {
  id: string;
  student_id_number: string;
  name: string;
  section: string;
  nfc_uid?: string; // New field we need to assume exists
}

export interface Teacher {
  id: string;
  name: string;
  nfc_uid: string; // New field
}

export interface Appointment {
  id: string;
  student_id: string;
  student_name: string;
  section: string;
  date: string;
  time: string;
  reason: string;
  status: 'PENDING' | 'ACCEPTED' | 'DENIED' | 'COMPLETED' | 'VERIFYING' | 'CONFIRMED';
  counselor_id: string;
  counselor_name: string; // Ensure this is included
}

export enum AppStep {
  LOGIN = 'LOGIN', // Teacher taps to log in
  SCAN_STUDENT = 'SCAN_STUDENT', // Teacher is ready to tap student
  PROCESSING = 'PROCESSING', // Looking up student/appt
  CONFIRM_DETAILS = 'CONFIRM_DETAILS', // New Step: Show details before sending
  WAITING_APPROVAL = 'WAITING_APPROVAL', // Notification sent, waiting for Counselor
  RESULT = 'RESULT', // Final result shown
  ERROR = 'ERROR',
  NO_APPOINTMENT = 'NO_APPOINTMENT' // "No authorization required"
}

export interface VerificationResult {
  status: 'ACCEPTED' | 'DENIED';
  studentName: string;
  appointmentTime: string;
  counselorName?: string;
}