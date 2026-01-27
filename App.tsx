import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { checkNfcSupport, scanNfcTag } from './nfcService';
import { Layout } from './components/Layout';
import { StatusBadge } from './components/StatusBadge';
import { AppStep, Appointment, Student, Teacher } from './types';
import { RealtimeChannel } from '@supabase/supabase-js';

const App: React.FC = () => {
  // State Machine
  const [step, setStep] = useState<AppStep>(AppStep.LOGIN);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Data State
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [scannedStudent, setScannedStudent] = useState<Student | null>(null);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  
  // Refs for cleanup
  const stopScanRef = useRef<(() => void) | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // Check NFC compatibility on mount
    if (!checkNfcSupport()) {
      setErrorMsg("Web NFC is not supported on this browser. Use Chrome on Android.");
    }

    return () => {
      stopNfcScan();
      unsubscribeRealtime();
    };
  }, []);

  // --- NFC Handlers ---

  const startNfcScan = async (mode: 'TEACHER' | 'STUDENT') => {
    setErrorMsg(null);
    if (stopScanRef.current) stopScanRef.current();

    const stop = await scanNfcTag(
      (serial, payload) => handleNfcRead(mode, serial, payload),
      (err) => setErrorMsg(err)
    );
    stopScanRef.current = stop;
  };

  const stopNfcScan = () => {
    if (stopScanRef.current) {
      stopScanRef.current();
      stopScanRef.current = null;
    }
  };

  const handleNfcRead = async (mode: 'TEACHER' | 'STUDENT', serial: string, payload: string) => {
    // Strategy: Prefer Payload if available, fallback to Serial.
    // Clean inputs: Remove null bytes and whitespace which commonly cause DB lookup failures.
    const cleanPayload = payload ? payload.replace(/\u0000/g, '').trim() : '';
    const cleanSerial = serial ? serial.trim() : '';
    
    // Normalize: Use the payload if it exists, otherwise serial. Lowercase it for consistent DB matching.
    const rawValue = cleanPayload || cleanSerial;
    const nfcValue = rawValue.toLowerCase();

    if (!nfcValue) {
      setErrorMsg("Empty NFC Tag read. Please try again.");
      return;
    }

    if (mode === 'TEACHER') {
      await authenticateTeacher(nfcValue);
    } else {
      await verifyStudent(nfcValue);
    }
  };

  // --- Logic Flows ---

  const authenticateTeacher = async (nfcUid: string) => {
    try {
      console.log(`Authenticating Teacher with UID: ${nfcUid}`);
      
      // Use .ilike() for case-insensitive match and .maybeSingle() to handle 0 results gracefully
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .ilike('nfc_uid', nfcUid) 
        .maybeSingle();

      if (error) {
        throw new Error(`Database Error: ${error.message}`);
      }

      if (!data) {
        // If data is null but no error, it usually means 1 of 2 things:
        // 1. The ID isn't in the DB.
        // 2. RLS (Row Level Security) is on, and no policy allows 'SELECT'.
        throw new Error(`Teacher ID not recognized. Scanned: ${nfcUid}. (Hint: Check DB Table or RLS Policies)`);
      }

      setTeacher(data);
      setStep(AppStep.SCAN_STUDENT);
      stopNfcScan(); // Stop login scan
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const verifyStudent = async (nfcUid: string) => {
    stopNfcScan(); // Stop scanning once we get a hit
    setStep(AppStep.PROCESSING);

    try {
      console.log(`Verifying Student with UID: ${nfcUid}`);

      // 1. Find Student (Check both nfc_uid and student_id_number using ilike)
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('*')
        .or(`nfc_uid.ilike.${nfcUid},student_id_number.ilike.${nfcUid}`)
        .maybeSingle();

      if (studentError) {
        throw new Error(`DB Error: ${studentError.message}`);
      }

      if (!student) {
        throw new Error(`Student tag not recognized. Scanned: ${nfcUid}`);
      }
      setScannedStudent(student);

      // 2. Find PENDING Appointment for today
      const { data: appt, error: apptError } = await supabase
        .from('appointments')
        .select('*')
        .eq('student_id', student.id)
        .eq('status', 'PENDING')
        .order('date', { ascending: false }) // Get latest
        .limit(1)
        .maybeSingle();

      if (apptError) {
        throw new Error(`Appointment Lookup Error: ${apptError.message}`);
      }

      if (!appt) {
        throw new Error(`No PENDING appointment found for ${student.name}.`);
      }

      setActiveAppointment(appt);

      // 3. Notify Counselor
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: appt.counselor_id,
          message: `VERIFICATION REQUEST: ${student.name} (${student.section}) is at the gate for appointment at ${appt.time}.`,
          is_read: false
        });

      if (notifError) {
        console.error("Notification failed", notifError);
      }

      // 4. Listen for Decision
      setStep(AppStep.WAITING_APPROVAL);
      subscribeToAppointment(appt.id);

    } catch (err: any) {
      setErrorMsg(err.message);
      setStep(AppStep.ERROR);
    }
  };

  // --- Realtime ---

  const subscribeToAppointment = (apptId: string) => {
    unsubscribeRealtime();

    const channel = supabase.channel(`appt-${apptId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'appointments',
          filter: `id=eq.${apptId}`
        },
        (payload) => {
          const newStatus = payload.new.status;
          if (newStatus === 'ACCEPTED' || newStatus === 'DENIED') {
            setActiveAppointment(payload.new as Appointment);
            setStep(AppStep.RESULT);
            unsubscribeRealtime();
          }
        }
      )
      .subscribe();
    
    realtimeChannelRef.current = channel;
  };

  const unsubscribeRealtime = () => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
  };

  const resetFlow = () => {
    setScannedStudent(null);
    setActiveAppointment(null);
    setErrorMsg(null);
    setStep(AppStep.SCAN_STUDENT);
    unsubscribeRealtime();
  };

  // --- Render Helpers ---

  const renderContent = () => {
    switch (step) {
      case AppStep.LOGIN:
        return (
          <div className="flex flex-col items-center space-y-8 animate-fade-in">
            <div className="w-48 h-48 rounded-full bg-purple-100 flex items-center justify-center animate-pulse border-4 border-purple-200">
               {/* Just NFC Icon */}
              <svg className="w-24 h-24 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M12 12a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-purple-900 font-medium text-lg">Teacher Login</p>
              <p className="text-slate-500 mt-2">Tap your NFC badge to verify identity</p>
            </div>
            <button 
              onClick={() => startNfcScan('TEACHER')}
              className="bg-purple-600 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-purple-200 hover:bg-purple-700 transition-colors w-full"
            >
              Start Scan
            </button>
          </div>
        );

      case AppStep.SCAN_STUDENT:
        return (
          <div className="flex flex-col items-center space-y-8">
            <div className="w-40 h-40 rounded-2xl bg-white shadow-xl flex items-center justify-center border border-purple-100">
               <svg className="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0c0 .854.409 1.638 1 2.143" />
               </svg>
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-slate-800">Ready to Verify</p>
              <p className="text-slate-500 mt-1">Tap Student ID Card</p>
            </div>
            <button 
              onClick={() => startNfcScan('STUDENT')}
              className="bg-purple-600 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-purple-200 hover:bg-purple-700 w-full"
            >
              Scan Student
            </button>
          </div>
        );

      case AppStep.PROCESSING:
        return (
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            <p className="text-slate-600">Looking up records...</p>
          </div>
        );

      case AppStep.WAITING_APPROVAL:
        return (
          <div className="w-full bg-white p-6 rounded-2xl shadow-xl border border-purple-50 text-center space-y-6">
             <div className="flex justify-center">
               <span className="relative flex h-6 w-6">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-6 w-6 bg-yellow-500"></span>
                </span>
             </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 mb-1">{scannedStudent?.name}</h3>
              <p className="text-slate-500 text-sm mb-4">{scannedStudent?.section}</p>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <p className="text-yellow-800 text-sm font-medium">Waiting for Counselor Approval</p>
                <p className="text-yellow-600 text-xs mt-1">Notification sent. Do not close.</p>
              </div>
            </div>
          </div>
        );

      case AppStep.RESULT:
        return (
          <div className="w-full flex flex-col items-center space-y-6">
            {activeAppointment && <StatusBadge status={activeAppointment.status as any} />}
            
            <div className="bg-white w-full p-6 rounded-2xl shadow-lg border border-purple-50 text-center">
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{scannedStudent?.name}</h3>
              <p className="text-slate-500 mb-6">{scannedStudent?.section}</p>
              
              <div className="space-y-3 text-left bg-purple-50 p-4 rounded-xl">
                 <div className="flex justify-between">
                    <span className="text-xs text-purple-400 uppercase font-bold">Time</span>
                    <span className="text-sm font-medium text-purple-900">{activeAppointment?.time}</span>
                 </div>
                 <div className="flex justify-between">
                    <span className="text-xs text-purple-400 uppercase font-bold">Reason</span>
                    <span className="text-sm font-medium text-purple-900">{activeAppointment?.reason}</span>
                 </div>
              </div>
            </div>

            <button 
              onClick={resetFlow}
              className="w-full py-4 text-purple-600 font-semibold hover:bg-purple-50 rounded-xl transition-colors"
            >
              Verify Next Student
            </button>
          </div>
        );
        
      case AppStep.ERROR:
        return (
          <div className="bg-red-50 w-full p-6 rounded-2xl border border-red-100 text-center">
            <div className="text-red-500 text-5xl mb-4">!</div>
            <h3 className="text-red-800 font-bold text-lg mb-2">Verification Failed</h3>
            <p className="text-red-600 mb-6 font-mono text-sm break-all">{errorMsg}</p>
            <button 
              onClick={resetFlow}
              className="bg-white text-red-600 border border-red-200 px-6 py-2 rounded-lg font-medium hover:bg-red-50"
            >
              Try Again
            </button>
          </div>
        );
    }
  };

  return (
    <Layout 
      title={step === AppStep.LOGIN ? "Gatekeeper Access" : undefined}
      teacherName={teacher?.name}
      onLogout={() => { setTeacher(null); setStep(AppStep.LOGIN); }}
    >
      <div className="w-full transition-all duration-300">
        {renderContent()}
        
        {/* Global Error Toast if not in Error State */}
        {errorMsg && step !== AppStep.ERROR && (
          <div className="fixed bottom-4 left-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-lg text-sm text-center">
            {errorMsg}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default App;