/**
 * Standardized NFC Reader Service
 * Supports:
 * 1. Web NFC (Android/Mobile via NDEFReader)
 * 2. Web Serial (Desktop/ESP32 via navigator.serial)
 */

export const checkNfcSupport = (): boolean => {
  return 'NDEFReader' in window;
};

export const checkSerialSupport = (): boolean => {
  return 'serial' in navigator;
};

// --- WEB NFC (Mobile) ---

export const scanNfcTag = async (
  onReading: (serialNumber: string, records: string) => void,
  onError: (error: string) => void
): Promise<() => void> => {
  if (!checkNfcSupport()) {
    onError("Web NFC is not supported. Use Chrome on Android or connect a Serial Reader.");
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

// --- WEB SERIAL (ESP32) ---

interface SerialConnection {
  write: (message: string) => Promise<void>;
  close: () => void;
}

export const connectSerialScanner = async (
  onReading: (uid: string) => void,
  onError: (error: string) => void
): Promise<SerialConnection | null> => {
  if (!checkSerialSupport()) {
    onError("Web Serial API not supported in this browser.");
    return null;
  }

  try {
    const port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate: 115200 });

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable!.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    const textEncoder = new TextEncoderStream();
    const writableStreamClosed = textEncoder.readable.pipeTo(port.writable!);
    const writer = textEncoder.writable.getWriter();

    let buffer = "";

    // Start reading loop in background
    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            // Allow the serial port to be closed later.
            reader.releaseLock();
            break;
          }
          if (value) {
            buffer += value;
            // Split by newline to handle complete UIDs
            const lines = buffer.split('\n');
            // Keep the last partial fragment in the buffer
            buffer = lines.pop() || ""; 

            for (const line of lines) {
              const cleanLine = line.replace(/\r/g, '').trim();
              if (cleanLine.length > 0) {
                 // Assume the ESP32 sends just the UID or "UID: <value>"
                 // Strip "UID:" prefix if present
                 const finalUid = cleanLine.replace(/^UID:/i, '').trim();
                 onReading(finalUid);
              }
            }
          }
        }
      } catch (readError: any) {
        onError(`Serial Read Error: ${readError.message}`);
      }
    })().catch((err) => console.error("Serial Loop Error", err));

    return {
      write: async (message: string) => {
        try {
          // Send message followed by newline for ESP32 to parse
          await writer.write(message + "\n");
        } catch (e) {
          console.error("Serial Write Error", e);
        }
      },
      close: async () => {
        try {
          reader.cancel();
          writer.close();
          await readableStreamClosed.catch(() => {});
          await writableStreamClosed.catch(() => {});
          await port.close();
        } catch (e) {
          console.error("Error closing serial port", e);
        }
      }
    };

  } catch (error: any) {
    onError(`Failed to open serial port: ${error.message}`);
    return null;
  }
};