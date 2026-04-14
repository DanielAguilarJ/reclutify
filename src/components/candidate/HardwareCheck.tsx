/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, ArrowLeft } from 'lucide-react';
import { useInterviewStore } from '@/store/interviewStore';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
import Logo from '@/components/ui/Logo';

export default function HardwareCheck() {
  const { setPhase } = useInterviewStore();
  const { language } = useAppStore();
  const t = dictionaries[language];

  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [step, setStep] = useState<'camera' | 'mic'>('camera');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [agreed, setAgreed] = useState(false);
  
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>(0);

  const startCamera = useCallback(async (deviceId?: string) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tk) => tk.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraReady(true);
    } catch (err) {
      console.error('Camera error:', err);
    }
  }, []);

  const startMic = useCallback(async (deviceId?: string) => {
    try {
      if (streamRef.current) {
         // keep video running if possible
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        const maxVol = Math.max(...dataArray);
        setVolumeLevel(maxVol / 255);
        animationRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
      setMicReady(true);
    } catch (err) {
      console.error('Mic error:', err);
    }
  }, []);

  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameras(devices.filter((d) => d.kind === 'videoinput'));
        setMics(devices.filter((d) => d.kind === 'audioinput'));
      } catch (err) {
        console.error('getDevices error:', err);
      }
    };
    getDevices();
    startCamera();
    startMic();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tk) => tk.stop());
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [startCamera, startMic]);

  const handleScreenShareAndContinue = async () => {
    if (!agreed) return;
    try {
      await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' } as MediaTrackConstraints,
      });
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // Fullscreen block ignored
      }
      setPhase('interview');
    } catch (err) {
      console.error('Screen share error:', err);
      alert("Screen sharing is required to proceed.");
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col pt-8">
      {/* Header Area */}
      <div className="flex justify-between items-center mb-12 w-full px-4">
        <Logo />
      </div>

      <AnimatePresence mode="wait">
        {step === 'camera' && (
          <motion.div
            key="camera"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center"
          >
            <div className="mb-6 self-start px-4">
               <button 
                  onClick={() => setPhase('overview')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-sm font-medium border border-border/50 shadow-sm text-foreground hover:bg-gray-50 cursor-pointer"
               >
                  <ArrowLeft className="h-4 w-4" /> {t.backButton}
               </button>
            </div>

            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-3">
                {t.checkCamera}
              </h1>
              <p className="text-muted text-sm max-w-md mx-auto leading-relaxed">
                {t.checkCameraSub}
              </p>
            </div>

            <div className="w-full max-w-lg bg-card rounded-[24px] shadow-sm border border-border/50 p-6 flex flex-col items-center">
              <div className="w-full mb-4">
                <div className="relative border border-border rounded-xl bg-white focus-within:ring-2 focus-within:ring-primary/20 transition-all overflow-hidden flex items-center pr-3">
                  <div className="px-3 flex items-center justify-center text-primary">
                    <Monitor className="h-4 w-4" />
                  </div>
                  <select
                    value={selectedCamera}
                    onChange={(e) => {
                      setSelectedCamera(e.target.value);
                      startCamera(e.target.value);
                    }}
                    className="w-full py-3 bg-transparent text-sm text-foreground font-medium outline-none cursor-pointer appearance-none"
                  >
                    {cameras.map((cam) => (
                      <option key={cam.deviceId} value={cam.deviceId}>
                        {cam.label || `${t.cameraLabel} ${cameras.indexOf(cam) + 1}`}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none text-muted">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>
              
              <div className="w-full rounded-[16px] overflow-hidden bg-foreground/5 aspect-video mb-6">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>

              <button
                onClick={() => setStep('mic')}
                disabled={!cameraReady}
                className={`px-8 py-3 rounded-full text-white font-medium text-sm transition-all shadow-sm ${
                  cameraReady
                    ? 'bg-primary hover:bg-primary-hover shadow-primary/25 cursor-pointer'
                    : 'bg-muted/40 cursor-not-allowed text-muted'
                }`}
              >
                {t.continueBtn}
              </button>
              <p className="text-xs text-muted mt-4 text-center">
                 {t.screenShareNote}
              </p>
            </div>
          </motion.div>
        )}

        {step === 'mic' && (
          <motion.div
            key="mic"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center"
          >
            <div className="mb-6 self-start px-4">
               <button 
                  onClick={() => setStep('camera')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-sm font-medium border border-border/50 shadow-sm text-foreground hover:bg-gray-50 cursor-pointer"
               >
                  <ArrowLeft className="h-4 w-4" /> {t.backButton}
               </button>
            </div>

            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-3">
                {t.checkMic}
              </h1>
              <p className="text-muted text-sm max-w-md mx-auto leading-relaxed">
                {t.checkMicSub}
              </p>
            </div>

            <div className="w-full max-w-lg">
              <div className="w-full mb-4">
                <div className="relative border border-border rounded-xl bg-white focus-within:ring-2 focus-within:ring-primary/20 transition-all overflow-hidden flex items-center pr-3 shadow-sm">
                  <div className="px-3 flex items-center justify-center text-primary">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </div>
                  <select
                    value={selectedMic}
                    onChange={(e) => {
                      setSelectedMic(e.target.value);
                      startMic(e.target.value);
                    }}
                    className="w-full py-3 bg-transparent text-sm text-foreground font-medium outline-none cursor-pointer appearance-none"
                  >
                    {mics.map((mic) => (
                      <option key={mic.deviceId} value={mic.deviceId}>
                        {mic.label || `Mic ${mics.indexOf(mic) + 1}`}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none text-muted">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>

              <div className="bg-card rounded-[24px] shadow-sm border border-border/50 p-6 flex flex-col items-center mb-8">
                <p className="text-sm font-medium text-foreground mb-5">
                  {t.micInstruction}
                </p>
                <div className="w-full bg-background rounded-2xl p-6 flex flex-col items-center mb-6">
                   <p className="text-lg font-medium text-muted/60 mb-5 text-center">
                      {t.testPhrase}
                   </p>
                   <div className="flex items-end gap-1.5 h-6">
                     {Array.from({ length: 16 }).map((_, i) => (
                       <div
                         key={i}
                         className="w-2.5 rounded-full bg-primary/20 transition-all duration-75"
                         style={{
                           height: `${Math.min(100, Math.max(20, volumeLevel * 100 * (1 + (i % 5) * 0.1) * (i % 3 === 0 ? 1.2 : 0.8)))}%`,
                           backgroundColor: volumeLevel > 0.1 ? 'var(--color-primary-light)' : 'rgba(168, 184, 252, 0.3)',
                         }}
                       />
                     ))}
                   </div>
                </div>

                <button
                  type="button"
                  className="w-full py-3 rounded-full bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors shadow-sm shadow-primary/25 cursor-pointer"
                >
                  {t.speakBtn}
                </button>
              </div>

              <div className="flex justify-center mb-6">
                 <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                       type="checkbox" 
                       checked={agreed}
                       onChange={(e) => setAgreed(e.target.checked)}
                       className="peer sr-only" 
                    />
                    <div className="w-4 h-4 rounded border border-border bg-white flex items-center justify-center peer-checked:bg-primary peer-checked:border-primary transition-all">
                       <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-sm text-foreground font-medium">{t.agreeTermsText} <span className="text-primary group-hover:underline">{t.termsLink}</span></span>
                 </label>
              </div>

              <div className="flex flex-col items-center">
                 <button
                   onClick={handleScreenShareAndContinue}
                   disabled={!agreed}
                   className={`px-8 py-3 rounded-full font-medium text-sm transition-all shadow-sm ${
                     agreed
                       ? 'bg-muted text-white hover:bg-muted/80 cursor-pointer'
                       : 'bg-muted/30 text-muted/60 cursor-not-allowed'
                   }`}
                 >
                   {t.screenShareBtn}
                 </button>
                 <p className="text-xs text-muted mt-4 text-center">
                    {t.screenShareNote}
                 </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
