import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose, isOpen }) => {
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<any[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const containerId = "barcode-scanner-reader-container";

  useEffect(() => {
    if (!isOpen) return;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer rear/environment/back camera
          const backCam = devices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('rear') ||
            device.label.toLowerCase().includes('environment')
          );
          setActiveCameraId(backCam ? backCam.id : devices[0].id);
        } else {
          setError("No cameras found.");
        }
      })
      .catch((err) => {
        console.error("Error getting cameras", err);
        setError("Camera permission denied or not available.");
      });

    return () => {
      stopScanning();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeCameraId) {
      startScanning(activeCameraId);
    }
    return () => {
      stopScanning();
    };
  }, [isOpen, activeCameraId]);

  const startScanning = async (deviceId: string) => {
    try {
      await stopScanning();

      const html5QrCode = new Html5Qrcode(containerId);
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        deviceId,
        {
          fps: 15,
          qrbox: (width, height) => {
            // Horizontal rectangular ratio suited for barcodes
            const boxWidth = Math.min(width * 0.85, 300);
            const boxHeight = Math.min(height * 0.45, 140);
            return { width: boxWidth, height: boxHeight };
          },
          aspectRatio: 1.333333,
        },
        (decodedText) => {
          onScan(decodedText);
          stopScanning();
          onClose();
        },
        () => {
          // Silent callback for frame scanning failures (normal when moving the barcode in front of camera)
        }
      );
    } catch (err) {
      console.error("Failed to start scanning", err);
      setError("Failed to access the camera stream.");
    }
  };

  const stopScanning = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.error("Error stopping scanner", err);
      }
      html5QrCodeRef.current = null;
    }
  };

  const toggleCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === activeCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setActiveCameraId(cameras[nextIndex].id);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[425px] overflow-hidden bg-white rounded-2xl border-slate-200">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <Camera className="w-5 h-5 text-[#D4AF37]" />
            Scan Product Barcode
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center p-4">
          {error ? (
            <div className="text-center p-6 space-y-3 bg-red-50 text-red-600 rounded-xl w-full">
              <p className="text-sm font-semibold">{error}</p>
              <p className="text-xs text-red-500">Please verify camera permissions and connect a working camera.</p>
              <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 mx-auto mt-2" onClick={() => setError(null)}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="w-full space-y-4">
              <div 
                id={containerId} 
                className="w-full aspect-[4/3] bg-slate-950 rounded-xl overflow-hidden shadow-inner border border-slate-800 relative"
              />
              
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <p className="italic">Align the barcode inside the target box.</p>
                {cameras.length > 1 && (
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={toggleCamera} 
                    className="flex items-center gap-1.5 text-[#1A2B4B] hover:bg-slate-100"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Switch Camera
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
