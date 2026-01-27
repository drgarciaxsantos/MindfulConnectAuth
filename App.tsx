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
    // Strategy: Prefer Payload if available (more secure if signed/encrypted in future), fallback to Serial
    // For this prototype, we assume the DB stores the value that matches the tag's output.
    const nfcValue = payload.trim() || serial;

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
      // NOTE: You must create a 'teachers' table or adapt this query to your specific user table
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .eq('nfc_uid', nfcUid)
        .single();

      if (error || !data) {
        throw new Error("Teacher ID not found. Access Denied.");
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
      // 1. Find Student
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('*')
        .or(`nfc_uid.eq.${nfcUid},student_id_number.eq.${nfcUid}`) // Check both for flexibility
        .single();

      if (studentError || !student) {
        throw new Error("Student tag not recognized.");
      }
      setScannedStudent(student);

      // 2. Find PENDING Appointment for today (or logic specific to your school rules)
      const { data: appt, error: apptError } = await supabase
        .from('appointments')
        .select('*')
        .eq('student_id', student.id)
        .eq('status', 'PENDING')
        .order('date', { ascending: false }) // Get latest
        .limit(1)
        .single();

      if (apptError || !appt) {
        throw new Error(`No PENDING appointment found for ${student.name}.`);
      }

      setActiveAppointment(appt);

      // 3. Notify Counselor
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: appt.counselor_id, // Send to the specific counselor
          message: `VERIFICATION REQUEST: ${student.name} (${student.section}) is at the gate for appointment at ${appt.time}.`,
          is_read: false
        });

      if (notifError) {
        console.error("Notification failed", notifError);
        // We continue anyway, hoping the counselor sees the dashboard update
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
              <svg className="w-20 h-20 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
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
            <p className="text-red-600 mb-6">{errorMsg}</p>
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