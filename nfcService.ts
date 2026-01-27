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
            
            // NDEF Text Record Layout:
            // Byte 0: Status byte (Bit 7: Encoding 0=UTF8, Bit 5-0: Lang code length)
            // Byte 1 to (1 + len): Language Code (e.g. "en")
            // Remaining: Actual Text
            
            if (record.data && record.data.byteLength > 0) {
              try {
                const statusByte = record.data.getUint8(0);
                const langCodeLength = statusByte & 0x3F; // Mask to get last 6 bits
                const textStart = 1 + langCodeLength;
                
                // Create a view of the actual text data, skipping header
                const textData = new DataView(
                  record.data.buffer, 
                  record.data.byteOffset + textStart, 
                  record.data.byteLength - textStart
                );
                
                payload = textDecoder.decode(textData);
              } catch (e) {
                // Fallback for non-standard text records
                console.warn("NFC Text Decode Error, falling back to raw decode", e);
                payload = textDecoder.decode(record.data);
              }
            } else {
               payload = textDecoder.decode(record.data);
            }
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