/**
 * Standardized NFC Reader Service
 * Uses the NDEFReader API available in Chrome for Android
 */

export const checkNfcSupport = (): boolean => {
  return 'NDEFReader' in window;
};

export const scanNfcTag = async (
  onReading: (serialNumber: string, records: string) => void,
  onError: (error: string) => void
): Promise<() => void> => {
  if (!checkNfcSupport()) {
    onError("NFC is not supported on this device or browser. Please use Chrome on Android.");
    return () => {};
  }

  try {
    // @ts-ignore - NDEFReader is strictly typed in newer TS libs but often missing in standard dom libs
    const ndef = new NDEFReader();
    
    await ndef.scan();
    
    const handleReading = (event: any) => {
      const serialNumber = event.serialNumber;
      let payload = '';

      // Try to read text record if available
      if (event.message && event.message.records) {
        for (const record of event.message.records) {
          if (record.recordType === "text") {
            const textDecoder = new TextDecoder(record.encoding);
            payload = textDecoder.decode(record.data);
          }
        }
      }

      onReading(serialNumber, payload);
    };

    const handleError = (error: any) => {
      onError(`NFC Read Error: ${error.message || error}`);
    };

    ndef.addEventListener("reading", handleReading);
    ndef.addEventListener("readingerror", handleError);

    // Return cleanup function
    return () => {
      ndef.removeEventListener("reading", handleReading);
      ndef.removeEventListener("readingerror", handleError);
    };

  } catch (error: any) {
    onError(`Failed to start NFC scan: ${error.message}. Ensure you have granted permissions.`);
    return () => {};
  }
};