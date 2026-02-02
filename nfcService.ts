/**
 * Standardized NFC Reader Service
 * Supports:
 * 1. Web NFC (Android/Mobile via NDEFReader)
 */

export const checkNfcSupport = (): boolean => {
  return 'NDEFReader' in window;
};

// --- WEB NFC (Mobile) ---

export const scanNfcTag = async (
  onReading: (serialNumber: string, records: string) => void,
  onError: (error: string) => void
): Promise<() => void> => {
  if (!checkNfcSupport()) {
    onError("Web NFC is not supported. Use Chrome on Android.");
    return () => {};
  }

  try {
    // @ts-ignore
    const ndef = new NDEFReader();
    await ndef.scan();
    
    const handleReading = (event: any) => {
      const serialNumber = event.serialNumber || '';
      let payload = '';

      if (event.message && event.message.records) {
        for (const record of event.message.records) {
          if (record.recordType === "text") {
            const textDecoder = new TextDecoder(record.encoding);
            if (record.data && record.data.byteLength > 0) {
              try {
                const statusByte = record.data.getUint8(0);
                const langCodeLength = statusByte & 0x3F;
                const textStart = 1 + langCodeLength;
                const textData = new DataView(
                  record.data.buffer, 
                  record.data.byteOffset + textStart, 
                  record.data.byteLength - textStart
                );
                payload = textDecoder.decode(textData);
              } catch (e) {
                payload = textDecoder.decode(record.data);
              }
            } else {
               payload = textDecoder.decode(record.data);
            }
          }
        }
      }

      const safePayload = payload.replace(/\0/g, '').trim();
      const safeSerial = serialNumber.replace(/\0/g, '').trim();
      onReading(safeSerial, safePayload);
    };

    const handleError = (error: any) => {
      onError(`NFC Read Error: ${error.message || error}`);
    };

    ndef.addEventListener("reading", handleReading);
    ndef.addEventListener("readingerror", handleError);

    return () => {
      ndef.removeEventListener("reading", handleReading);
      ndef.removeEventListener("readingerror", handleError);
    };

  } catch (error: any) {
    onError(`Failed to start NFC scan: ${error.message}.`);
    return () => {};
  }
};