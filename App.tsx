import React, { useState, useEffect, useRef } from 'react';
import { supabase, checkSupabaseConfig, testConnection } from './supabase';
import { checkNfcSupport, scanNfcTag } from './nfcService';
import { Layout } from './components/Layout';
import { StatusBadge } from './components/StatusBadge';
import { AppStep, Appointment, Student, Teacher } from './types';
import { RealtimeChannel } from '@supabase/supabase-js';

// Helper to parse date/time strings from DB
const parseDateTime = (dateStr: string, timeStr: string): Date | null => {
  try {
    if (!dateStr || !timeStr) return null;

    // dateStr: YYYY-MM-DD
    const [year, month, day] = dateStr.split('-').map(Number);
    
    // Use regex to robustly handle "09:00 AM", "9:00AM", "09:00", etc.
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/i);
    if (!match) return null;

    let [_, hStr, mStr, period] = match;
    let hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    
    if (period) {
      period = period.toUpperCase();
      if (period === 'PM' && hours !== 12) {
        hours += 12;
      } else if (period === 'AM' && hours === 12) {
        hours = 0;
      }
    }
    
    return new Date(year, month - 1, day, hours, minutes);
  } catch (e) {
    console.error("Date parsing error", e);
    return null;
  }
};

export const App: React.FC = () => {
  // State Machine
  const [step, setStep] = useState<AppStep>(AppStep.LOGIN);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  
  // Data State
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [scannedStudent, setScannedStudent] = useState<Student | null>(null);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [minutesUntilAppt, setMinutesUntilAppt] = useState<number>(0);
  const [isConfirmingDeparture, setIsConfirmingDeparture] = useState(false);
  
  // Refs for cleanup
  const stopScanRef = useRef<(() => void) | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    initApp();
    return () => {
      stopNfcScan();
      unsubscribeRealtime();
    };
  }, []);

  const initApp = async () => {
    setIsConnecting(true);
    setErrorMsg(null);

    const configCheck = checkSupabaseConfig();
    if (!configCheck.valid) {
      setErrorMsg(configCheck.message || "Database configuration error");
      setStep(AppStep.ERROR);
      setIsConnecting(false);
      return;
    }

    const conn = await testConnection();
    if (!conn.success) {
      setErrorMsg(`Connection Error: ${conn.message}.`);
      setStep(AppStep.ERROR);
      setIsConnecting(false);
      return;
    }

    if (!checkNfcSupport()) {
      setErrorMsg("No NFC support detected. Please use Chrome on Android.");
    }

    setIsConnecting(false);
  };

  // --- NFC Handlers ---

  const startNfcScan = async (mode: 'TEACHER' | 'STUDENT') => {
    setErrorMsg(null);
    if (stopScanRef.current) stopScanRef.current();

    if (checkNfcSupport()) {
      const stop = await scanNfcTag(
        (serial, payload) => handleNfcRead(mode, serial, payload),
        (err) => setErrorMsg(err)
      );
      stopScanRef.current = stop;
    } else {
      setErrorMsg("Web NFC not supported on this device.");
    }
  };

  const stopNfcScan = () => {
    if (stopScanRef.current) {
      stopScanRef.current();
      stopScanRef.current = null;
    }
  };

  const handleNfcRead = async (mode: 'TEACHER' | 'STUDENT', serial: string, payload: string) => {
    const cleanPayload = payload ? payload.replace(/\u0000/g, '').trim() : '';
    const cleanSerial = serial ? serial.trim() : '';
    const nfcValue = (cleanPayload || cleanSerial).toLowerCase();

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
      console.log(`Authenticating Staff with UID: ${nfcUid}`);
      
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .ilike('nfc_uid', nfcUid) 
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("Unauthorized Tag");
      }

      setTeacher(data);
      setStep(AppStep.SCAN_STUDENT);
      stopNfcScan(); 
    } catch (err: any) {
      handleError(err);
    }
  };

  const verifyStudent = async (nfcUid: string) => {
    stopNfcScan(); 
    setStep(AppStep.PROCESSING);

    try {
      console.log(`Verifying Student with UID: ${nfcUid}`);

      let query = supabase.from('students').select('*');
      if (nfcUid.includes(':')) {
         query = query.ilike('nfc_uid', nfcUid);
      } else {
         query = query.or(`nfc_uid.ilike."${nfcUid}",student_id_number.ilike."${nfcUid}"`);
      }

      const { data: student, error: studentError } = await query.maybeSingle();

      if (studentError) throw studentError;

      if (!student) {
        throw new Error("Unauthorized Tag");
      }
      setScannedStudent(student);

      const { data: appt, error: apptError } = await supabase
        .from('appointments')
        .select('*')
        .eq('student_id', student.id)
        .in('status', ['ACCEPTED', 'VERIFYING', 'CONFIRMED']) 
        .order('date', { ascending: false }) 
        .limit(1)
        .maybeSingle();

      if (apptError) throw apptError;

      if (!appt) {
        console.log("No confirmed appointment found for student:", student.id);
        setStep(AppStep.NO_APPOINTMENT);
        return; 
      }

      // Check Time Window
      const apptDate = parseDateTime(appt.date, appt.time);
      
      if (!apptDate) {
         // Fail Safe: If we can't parse the date, don't allow access blindly.
         console.error("Failed to parse appointment date/time:", appt.date, appt.time);
         setErrorMsg("Invalid Appointment Date Format. Please contact Admin.");
         setStep(AppStep.ERROR);
         return;
      }

      const now = new Date();
      const diffMs = apptDate.getTime() - now.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      
      console.log("Time Check:", { appt: apptDate, now, diffMinutes });

      // If appointment is more than 15 minutes in the future, block it.
      if (diffMinutes > 15) {
           setActiveAppointment(appt);
           setMinutesUntilAppt(diffMinutes);
           setStep(AppStep.TOO_EARLY);
           return;
      }
      
      // If appointment is more than 30 minutes in the past, consider it expired/missed.
      // e.g., if diffMinutes is -31, it is 31 minutes ago.
      if (diffMinutes < -30) {
           setActiveAppointment(appt);
           setMinutesUntilAppt(Math.abs(diffMinutes)); // Store how late they are
           setStep(AppStep.EXPIRED);
           return;
      }

      // Found appointment
      setActiveAppointment(appt);
      setStep(AppStep.CONFIRM_DETAILS);

    } catch (err: any) {
      handleError(err);
    }
  };

  const initiateGateRequest = async () => {
    if (!activeAppointment || !scannedStudent) return;
    
    setStep(AppStep.PROCESSING);

    try {
      // 1. Update status to VERIFYING
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'VERIFYING' })
        .eq('id', activeAppointment.id);
        
      if (updateError) {
        console.error("Status update error", updateError);
      } else {
        const updatedAppt = { ...activeAppointment, status: 'VERIFYING' as const };
        setActiveAppointment(updatedAppt);
      }

      // 2. Send Explicit Notification with Teacher/Guard Name
      const teacherName = teacher?.name || "Gatekeeper";
      
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: activeAppointment.counselor_id,
          message: `GATE_REQUEST: ${teacherName} asked for the verification of ${scannedStudent.name}.`,
          is_read: false
        });

      if (notifError) console.error("Notification failed", notifError);

      // 3. Wait
      setStep(AppStep.WAITING_APPROVAL);
      subscribeToAppointment(activeAppointment.id);

    } catch (err) {
      handleError(err);
    }
  };

  const confirmDeparture = async () => {
    if (!activeAppointment || !scannedStudent) return;
    setIsConfirmingDeparture(true);

    try {
      const teacherName = teacher?.name || "Staff";

      // 1. Update Appointment Status to DEPARTED
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'DEPARTED' })
        .eq('id', activeAppointment.id);

      if (updateError) throw updateError;

      // 2. Send Notification to Counselor
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: activeAppointment.counselor_id,
          message: `GATE_UPDATE: ${teacherName} confirmed that ${scannedStudent.name} is on their way to the Guidance Office.`,
          is_read: false
        });
      
      if (notifError) console.error("Notification failed", notifError);

      // 3. Update Local State
      setActiveAppointment({ ...activeAppointment, status: 'DEPARTED' });
    } catch (err) {
      handleError(err);
    } finally {
      setIsConfirmingDeparture(false);
    }
  };

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
          
          if (newStatus === 'ACCEPTED' || newStatus === 'CONFIRMED') {
            setActiveAppointment(payload.new as Appointment);
            setStep(AppStep.RESULT);
            unsubscribeRealtime();
          } else if (newStatus === 'DENIED') {
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
    setIsConfirmingDeparture(false);
    unsubscribeRealtime();
  };

  const handleError = (err: any) => {
    console.error("App Error:", err);
    let message = err.message || "Unknown Error";
    if (message.includes("Failed to fetch")) {
      message = "Network Error: Cannot reach database.";
    }
    setErrorMsg(message);
    setStep(AppStep.ERROR);
  };

  // --- Render ---

  const renderContent = () => {
    if (isConnecting) {
      return (
        <div className="flex flex-col items-center space-y-4 pt-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          <p className="text-slate-500 text-sm">Connecting to system...</p>
        </div>
      );
    }

    switch (step) {
      case AppStep.LOGIN:
        return (
          <div className="flex flex-col items-center space-y-8 animate-fade-in">
            <div className="w-48 h-48 rounded-full bg-purple-100 flex items-center justify-center animate-pulse border-4 border-purple-200">
              <svg className="w-24 h-24 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M12 12a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-purple-900 font-medium text-lg">Staff Login</p>
              <p className="text-slate-500 mt-2">Tap Teacher or Guard NFC badge</p>
            </div>
            <div className="w-full space-y-3">
              <button 
                onClick={() => startNfcScan('TEACHER')}
                className="bg-purple-600 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-purple-200 hover:bg-purple-700 w-full"
              >
                Scan with Phone NFC
              </button>
            </div>
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
            <p className="text-slate-600">Processing...</p>
          </div>
        );

      case AppStep.CONFIRM_DETAILS:
        return (
          <div className="w-full bg-white p-6 rounded-2xl shadow-xl border border-purple-50 space-y-6 animate-fade-in">
             <div className="text-center border-b border-purple-100 pb-4">
                <h3 className="text-2xl font-bold text-slate-900">{scannedStudent?.name}</h3>
                <p className="text-slate-500 text-sm mt-1">{scannedStudent?.section}</p>
             </div>
             <div className="space-y-4">
                <div className="bg-purple-50 p-4 rounded-xl space-y-3">
                   <div className="flex justify-between items-center border-b border-purple-200 pb-2">
                      <span className="text-xs text-purple-600 uppercase font-bold tracking-wider">Date</span>
                      <span className="text-base font-semibold text-slate-800">{activeAppointment?.date}</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-purple-200 pb-2">
                      <span className="text-xs text-purple-600 uppercase font-bold tracking-wider">Time</span>
                      <span className="text-base font-semibold text-slate-800">{activeAppointment?.time}</span>
                   </div>
                   <div className="flex flex-col space-y-1">
                      <span className="text-xs text-purple-600 uppercase font-bold tracking-wider">Counselor</span>
                      <span className="text-base font-semibold text-slate-800">{activeAppointment?.counselor_name}</span>
                   </div>
                </div>
             </div>
             <div className="flex flex-col gap-3 pt-2">
                <button 
                  onClick={initiateGateRequest}
                  className="w-full py-4 bg-purple-600 text-white font-bold rounded-xl shadow-lg shadow-purple-200 hover:bg-purple-700 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Send Verification
                </button>
                <button 
                  onClick={resetFlow}
                  className="w-full py-3 text-slate-500 font-medium hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
             </div>
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
                <p className="text-yellow-800 text-sm font-medium">Request Sent</p>
                <p className="text-yellow-600 text-xs mt-1">Waiting for counselor confirmation...</p>
              </div>
            </div>
          </div>
        );

      case AppStep.RESULT:
        const status = activeAppointment?.status;
        const isApproved = status === 'ACCEPTED' || status === 'CONFIRMED';
        const isDeparted = status === 'DEPARTED';
        const isGuard = teacher?.name?.toLowerCase().includes('guard');
        
        return (
          <div className="w-full flex flex-col items-center space-y-6 animate-fade-in">
             {activeAppointment && <StatusBadge status={activeAppointment.status as any} />}
             
             <div className="bg-white w-full rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                <div className={`p-6 text-center border-b ${isApproved || isDeparted ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <h3 className="text-2xl font-bold text-slate-900 mb-1">{scannedStudent?.name}</h3>
                    <p className="text-slate-500">{scannedStudent?.section}</p>
                </div>
                
                <div className="p-8 text-center space-y-4">
                   {isDeparted ? (
                      <>
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                           <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                           </svg>
                        </div>
                        <h4 className="text-lg font-bold text-blue-700">Departure Confirmed</h4>
                        <p className="text-slate-600 leading-relaxed">
                          <span className="font-semibold">{scannedStudent?.name}</span> is now on their way to the Guidance Office.
                        </p>
                      </>
                   ) : isApproved ? (
                      <>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                           <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                           </svg>
                        </div>
                        <h4 className="text-lg font-bold text-green-700">Authorization Granted</h4>
                        <p className="text-slate-600 leading-relaxed">
                          <span className="font-semibold">{scannedStudent?.name}</span>
                          {isGuard ? (
                             <> may <span className="font-bold text-green-700">enter the campus</span> and proceed to the <span className="font-semibold text-purple-700">Guidance Office</span>.</>
                          ) : (
                             <> may <span className="font-bold text-green-700">exit the class</span> and proceed to the <span className="font-semibold text-purple-700">Guidance Office</span> immediately.</>
                          )}
                        </p>
                      </>
                   ) : (
                      <>
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                           <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                           </svg>
                        </div>
                         <h4 className="text-lg font-bold text-red-700">Authorization Denied</h4>
                         <p className="text-slate-600 leading-relaxed">
                           <span className="font-semibold">{scannedStudent?.name}</span> is not authorized to leave. Please return to class.
                         </p>
                      </>
                   )}
                </div>
             </div>
            
            {/* Actions */}
            {isDeparted || (!isApproved && !isDeparted) ? (
               <button 
                 onClick={resetFlow}
                 className="w-full py-4 bg-white text-purple-600 font-semibold border border-purple-100 shadow-sm hover:bg-purple-50 rounded-xl transition-colors"
               >
                 Verify Next Student
               </button>
            ) : (
               <div className="w-full space-y-3">
                 <button 
                   onClick={confirmDeparture}
                   disabled={isConfirmingDeparture}
                   className="w-full py-4 bg-purple-600 text-white font-bold rounded-xl shadow-lg shadow-purple-200 hover:bg-purple-700 flex items-center justify-center gap-2"
                 >
                   {isConfirmingDeparture ? (
                     <>
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                        Updating...
                     </>
                   ) : (
                     <>
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                       </svg>
                       Confirm Student Departure
                     </>
                   )}
                 </button>
                 <button 
                    onClick={resetFlow}
                    className="w-full py-3 text-slate-400 font-medium text-sm hover:text-purple-600 transition-colors"
                  >
                    Skip & Verify Next
                  </button>
               </div>
            )}
          </div>
        );

      case AppStep.NO_APPOINTMENT:
        return (
          <div className="flex flex-col items-center text-center space-y-6">
             <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center border-4 border-slate-200 mb-2">
                <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
             </div>
            <div className="w-full bg-white p-6 rounded-2xl shadow-lg border border-purple-50">
               <h3 className="text-xl font-bold text-slate-900 mb-1">{scannedStudent?.name}</h3>
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-4">
                  <p className="text-slate-800 font-bold text-lg">No confirmed appointment.</p>
                  <p className="text-slate-500 text-sm mt-1">Student has no upcoming appointments approved by a counselor.</p>
               </div>
            </div>
             <button onClick={resetFlow} className="w-full py-4 text-purple-600 font-semibold hover:bg-purple-50 rounded-xl">
              Verify Next Student
            </button>
          </div>
        );
        
      case AppStep.TOO_EARLY:
        return (
          <div className="flex flex-col items-center text-center space-y-6">
             <div className="w-24 h-24 rounded-full bg-orange-100 flex items-center justify-center border-4 border-orange-200 mb-2">
                <svg className="w-12 h-12 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
             </div>
             <div className="w-full bg-white p-6 rounded-2xl shadow-lg border border-orange-50">
                <h3 className="text-xl font-bold text-slate-900 mb-1">{scannedStudent?.name}</h3>
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 mt-4">
                   <p className="text-orange-800 font-bold text-lg">Too Early</p>
                   <p className="text-orange-700 text-sm mt-1">
                     Appointment is at <span className="font-semibold">{activeAppointment?.time}</span>.
                   </p>
                   <p className="text-orange-700 text-sm mt-2 font-medium">
                     Please wait {minutesUntilAppt - 15} more minute(s).
                   </p>
                   <p className="text-xs text-slate-400 mt-2">
                     Verification allowed 15 mins before.
                   </p>
                </div>
             </div>
              <button onClick={resetFlow} className="w-full py-4 text-orange-600 font-semibold hover:bg-orange-50 rounded-xl">
               Verify Next Student
             </button>
          </div>
        );

      case AppStep.EXPIRED:
        // Format relative time (e.g. "45 minutes ago")
        const lateMinutes = minutesUntilAppt; // Stored in state as positive number
        const hoursLate = Math.floor(lateMinutes / 60);
        const minsLate = lateMinutes % 60;
        let timeAgoString = `${lateMinutes} minutes late`;
        if (hoursLate > 0) {
            timeAgoString = `${hoursLate} hour${hoursLate > 1 ? 's' : ''} ${minsLate} min late`;
        }

        return (
          <div className="flex flex-col items-center text-center space-y-6">
             <div className="w-24 h-24 rounded-full bg-red-50 flex items-center justify-center border-4 border-red-100 mb-2">
                <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
             </div>
             <div className="w-full bg-white p-6 rounded-2xl shadow-lg border border-red-100">
                <h3 className="text-xl font-bold text-slate-900 mb-1">{scannedStudent?.name}</h3>
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 mt-4 text-left">
                   <div className="flex items-center gap-2 mb-3">
                       <span className="bg-red-200 text-red-800 text-xs font-bold px-2 py-1 rounded">EXPIRED</span>
                       <span className="text-red-700 font-bold text-lg">Appointment Missed</span>
                   </div>
                   
                   <div className="space-y-2 border-t border-red-200 pt-3">
                       <div className="flex justify-between text-sm">
                          <span className="text-red-800/70">Scheduled Date:</span>
                          <span className="font-semibold text-red-900">{activeAppointment?.date}</span>
                       </div>
                       <div className="flex justify-between text-sm">
                          <span className="text-red-800/70">Scheduled Time:</span>
                          <span className="font-semibold text-red-900">{activeAppointment?.time}</span>
                       </div>
                       <div className="flex justify-between text-sm bg-red-100 p-2 rounded">
                          <span className="text-red-800 font-medium">Status:</span>
                          <span className="font-bold text-red-900">{timeAgoString}</span>
                       </div>
                   </div>

                   <p className="text-red-600/80 text-xs mt-3 italic text-center">
                     Access denied. Valid window has passed.
                   </p>
                </div>
             </div>
              <button 
                onClick={resetFlow} 
                className="w-full py-4 text-red-600 font-semibold hover:bg-red-50 rounded-xl transition-colors border-2 border-transparent hover:border-red-100"
              >
               Verify Next Student
             </button>
          </div>
        );

      case AppStep.ERROR:
        return (
           <div className="bg-red-50 w-full p-6 rounded-2xl border border-red-100 text-center">
            <h3 className="text-red-800 font-bold text-lg mb-2">Error</h3>
            <p className="text-red-600 mb-6 font-mono text-sm break-all">{errorMsg}</p>
            <button onClick={() => window.location.reload()} className="bg-purple-600 text-white px-6 py-2 rounded-lg">Reload</button>
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
      </div>
    </Layout>
  );
};