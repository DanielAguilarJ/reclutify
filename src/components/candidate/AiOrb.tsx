'use client';

import { motion } from 'framer-motion';

interface AiOrbProps {
  isSpeaking: boolean;
  isProcessing: boolean;
}

export default function AiOrb({ isSpeaking, isProcessing }: AiOrbProps) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer blurred ring (purple/blue glow) */}
      <motion.div
        className="absolute rounded-full filter blur-xl"
        style={{
          width: 140,
          height: 140,
          background: 'linear-gradient(135deg, rgba(168,85,247,0.4) 0%, rgba(59,130,246,0.6) 100%)',
        }}
        animate={
          isSpeaking
            ? {
                scale: [1, 1.4, 1],
                opacity: [0.6, 0.9, 0.6],
              }
            : {
                scale: [1, 1.1, 1],
                opacity: [0.4, 0.6, 0.4],
              }
        }
        transition={{
          duration: isSpeaking ? 1.5 : 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Secondary blurred ring */}
      <motion.div
        className="absolute rounded-full filter blur-lg"
        style={{
          width: 110,
          height: 110,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.5) 0%, rgba(59,130,246,0.8) 100%)',
        }}
        animate={
          isSpeaking
            ? {
                scale: [1, 1.3, 1],
                opacity: [0.8, 1, 0.8],
              }
            : {
                scale: [1, 1.05, 1],
                opacity: [0.5, 0.7, 0.5],
              }
        }
        transition={{
          duration: isSpeaking ? 1.2 : 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.2,
        }}
      />

      {/* Main white orb container */}
      <motion.div
        className="relative z-10 flex items-center justify-center rounded-full bg-white shadow-lg border border-black/[0.04]"
        style={{
          width: 80,
          height: 80,
        }}
        animate={
          isProcessing
            ? { rotate: [0, 5, -5, 0] }
            : isSpeaking
            ? { scale: [1, 1.05, 1] }
            : { scale: [1, 1, 1] }
        }
        transition={
          isProcessing
            ? { duration: 0.5, repeat: Infinity }
            : {
                duration: isSpeaking ? 1.5 : 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }
        }
      >
        {/* Inner text "W." */}
        <span className="text-2xl font-black tracking-tight text-black">
          W.
        </span>
      </motion.div>
    </div>
  );
}
