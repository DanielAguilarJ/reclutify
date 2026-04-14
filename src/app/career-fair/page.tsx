'use client';

import { QrCode, ArrowRight, Play, GraduationCap } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import { useAppStore } from '@/store/appStore';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function CareerFairPage() {
  const { language } = useAppStore();
  const es = language === 'es';

  return (
    <div className="min-h-screen bg-[#060b13] relative overflow-hidden flex flex-col items-center justify-center">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-[#3b4cca] rounded-full blur-[150px] opacity-20 translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 left-0 w-[50vw] h-[50vw] bg-[#10B981] rounded-full blur-[150px] opacity-10 -translate-x-1/2 translate-y-1/2" />

      <div className="relative z-10 w-full max-w-lg p-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center mb-8">
           <Logo forceWhiteLabel={true} />
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="bg-[#111822] rounded-3xl p-8 border border-white/10 shadow-[0_0_100px_rgba(59,76,202,0.1)] backdrop-blur-xl">
           <div className="text-center mb-8">
             <div className="bg-primary/20 text-primary px-3 py-1.5 rounded-full inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-4">
               <GraduationCap className="h-4 w-4" />
               {es ? 'Feria de Empleos 2026' : 'Career Fair 2026'}
             </div>
             <h1 className="text-3xl font-bold text-white mb-3">
               {es ? 'Evalúa tu Perfil Profesional' : 'Evaluate Your Professional Profile'}
             </h1>
             <p className="text-white/60 text-sm leading-relaxed">
               {es 
                 ? 'La Universidad ha habilitado este kiosco de IA. Practica tus entrevistas con Zara y recibe rúbricas predictivas del mercado.' 
                 : 'The University has enabled this AI kiosk. Practice your interviews with Zara and receive market-predictive rubrics.'}
             </p>
           </div>

           <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/10 rounded-2xl mb-8 bg-white/[0.02] relative overflow-hidden group hover:border-primary/50 transition-colors">
             <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
             <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md mb-4 shadow-xl">
               <QrCode className="h-24 w-24 text-white/80" />
             </div>
             <p className="text-xs text-white/50 mb-6 uppercase tracking-widest font-semibold">{es ? 'Escanea para Iniciar' : 'Scan to Start'}</p>
             
             <div className="w-full flex items-center gap-4">
                <div className="h-px bg-white/10 flex-1" />
                <span className="text-xs text-white/30 font-medium">O</span>
                <div className="h-px bg-white/10 flex-1" />
             </div>

             <Link href="/practice" className="mt-6 bg-[#3b4cca] hover:bg-[#4a5ddd] text-white px-8 py-3.5 rounded-xl font-semibold transition-all flex items-center gap-2 w-full justify-center shadow-lg shadow-[#3b4cca]/20 group/btn">
               <Play className="h-4 w-4 group-hover/btn:scale-110 transition-transform" />
               {es ? 'Entrar al Simulador' : 'Enter Simulator'}
             </Link>
           </div>

           <p className="text-xs text-center text-white/30">
               © {new Date().getFullYear()} Reclutify AI for Universities.
           </p>
        </motion.div>
      </div>
    </div>
  );
}
