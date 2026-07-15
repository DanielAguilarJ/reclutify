'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Mic, ArrowRight, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useInterviewStore } from '@/store/interviewStore';
import { useAppStore } from '@/store/appStore';
import Logo from '@/components/ui/Logo';

function mediaErrorMessage(err: unknown, lang: string) {
  const e = err as DOMException;

  if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
    return lang === 'es'
      ? 'Necesitamos permiso de cámara y micrófono para grabar la entrevista interna.'
      : 'Camera and microphone permission is required to record the internal interview.';
  }

  if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
    return lang === 'es'
      ? 'No encontramos cámara o micrófono en este dispositivo.'
      : 'No camera or microphone was found on this device.';
  }

  return lang === 'es'
    ? 'No se pudo acceder a cámara o micrófono. Revisa tus dispositivos.'
    : 'Could not access camera or microphone. Check your devices.';
}

export default function QuickDeviceSetup() {
  const {
    setPhase,
    setSelectedCameraId,
    setSelectedMicId,
    selectedCameraId,
    selectedMicId,
  } = useInterviewStore();

  const { language } = useAppStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState(selectedCameraId || '');
  const [micId, setMicId] = useState(selectedMicId || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stopPreview = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startPreview = useCallback(
    async (nextCameraId?: string, nextMicId?: string) => {
      try {
        setError(null);
        stopPreview();

        const stream = await navigator.mediaDevices.getUserMedia({
          video: nextCameraId
            ? {
                deviceId: { exact: nextCameraId },
                width: { ideal: 640, max: 854 },
                height: { ideal: 360, max: 480 },
                frameRate: { ideal: 15, max: 20 },
              }
            : {
                width: { ideal: 640, max: 854 },
                height: { ideal: 360, max: 480 },
                frameRate: { ideal: 15, max: 20 },
              },
          audio: nextMicId
            ? {
                deviceId: { exact: nextMicId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        const actualCamera =
          nextCameraId ||
          stream.getVideoTracks()[0]?.getSettings()?.deviceId ||
          '';

        const actualMic =
          nextMicId ||
          stream.getAudioTracks()[0]?.getSettings()?.deviceId ||
          '';

        if (actualCamera) {
          setCameraId(actualCamera);
          setSelectedCameraId(actualCamera);
        }

        if (actualMic) {
          setMicId(actualMic);
          setSelectedMicId(actualMic);
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameras(devices.filter((d) => d.kind === 'videoinput'));
        setMics(devices.filter((d) => d.kind === 'audioinput'));
      } catch (err) {
        console.error('Quick device setup error:', err);
        setError(mediaErrorMessage(err, language));
      } finally {
        setLoading(false);
      }
    },
    [language, setSelectedCameraId, setSelectedMicId]
  );

  useEffect(() => {
    startPreview(cameraId || undefined, micId || undefined);

    return () => {
      stopPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const continueToInterview = () => {
    setSelectedCameraId(cameraId || null);
    setSelectedMicId(micId || null);
    stopPreview();
    setPhase('interview');
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col pt-8">
      <div className="flex justify-between items-center mb-10 w-full px-4">
        <Logo />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center"
      >
        <div className="mb-6 self-start px-4">
          <button
            onClick={() => setPhase('overview')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-sm font-medium border border-border/50 shadow-sm text-foreground hover:bg-gray-50 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            {language === 'es' ? 'Atrás' : 'Back'}
          </button>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-3">
            {language === 'es'
              ? 'Selecciona cámara y micrófono'
              : 'Select camera and microphone'}
          </h1>
          <p className="text-muted text-sm max-w-md mx-auto leading-relaxed">
            {language === 'es'
              ? 'Modo interno: no haremos prueba de micrófono, no pediremos pantalla completa y no compartiremos pantalla. La entrevista se grabará con cámara y audio.'
              : 'Internal mode: no microphone test, no fullscreen and no screen sharing. The interview will be recorded with camera and audio.'}
          </p>
        </div>

        <div className="w-full max-w-lg bg-card rounded-[24px] shadow-sm border border-border/50 p-6">
          {error && (
            <div className="w-full mb-4 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-700">{error}</p>
                <button
                  onClick={() => startPreview(cameraId || undefined, micId || undefined)}
                  className="mt-2 text-sm font-medium text-red-600 hover:text-red-800 underline cursor-pointer"
                >
                  {language === 'es' ? 'Reintentar' : 'Retry'}
                </button>
              </div>
            </div>
          )}

          <div className="w-full rounded-[16px] overflow-hidden bg-foreground/5 aspect-video mb-5">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>

          <div className="space-y-3 mb-6">
            <div className="relative border border-border rounded-xl bg-white focus-within:ring-2 focus-within:ring-primary/20 transition-all overflow-hidden flex items-center pr-3">
              <div className="px-3 flex items-center justify-center text-primary">
                <Camera className="h-4 w-4" />
              </div>
              <select
                value={cameraId}
                onChange={(e) => {
                  const value = e.target.value;
                  setCameraId(value);
                  setSelectedCameraId(value);
                  startPreview(value || undefined, micId || undefined);
                }}
                className="w-full py-3 bg-transparent text-sm text-foreground font-medium outline-none cursor-pointer appearance-none animate-none"
              >
                {cameras.length === 0 && (
                  <option value="">
                    {language === 'es' ? 'Cámara predeterminada' : 'Default camera'}
                  </option>
                )}
                {cameras.map((cam, i) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `${language === 'es' ? 'Cámara' : 'Camera'} ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative border border-border rounded-xl bg-white focus-within:ring-2 focus-within:ring-primary/20 transition-all overflow-hidden flex items-center pr-3">
              <div className="px-3 flex items-center justify-center text-primary">
                <Mic className="h-4 w-4" />
              </div>
              <select
                value={micId}
                onChange={(e) => {
                  const value = e.target.value;
                  setMicId(value);
                  setSelectedMicId(value);
                  startPreview(cameraId || undefined, value || undefined);
                }}
                className="w-full py-3 bg-transparent text-sm text-foreground font-medium outline-none cursor-pointer appearance-none animate-none"
              >
                {mics.length === 0 && (
                  <option value="">
                    {language === 'es' ? 'Micrófono predeterminado' : 'Default microphone'}
                  </option>
                )}
                {mics.map((mic, i) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `${language === 'es' ? 'Micrófono' : 'Microphone'} ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={continueToInterview}
            disabled={loading || !!error}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-full font-medium text-sm transition-all ${
              loading || error
                ? 'bg-muted/30 text-muted cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary-hover shadow-primary/25 cursor-pointer'
            }`}
          >
            {loading
              ? language === 'es'
                ? 'Preparando dispositivos...'
                : 'Preparing devices...'
              : language === 'es'
                ? 'Continuar a entrevista'
                : 'Continue to interview'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
