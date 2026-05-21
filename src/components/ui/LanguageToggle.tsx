'use client';

import { motion } from 'framer-motion';
import { useAppStore } from '@/store/appStore';

export default function LanguageToggle() {
  const { language, setLanguage } = useAppStore();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'es' : 'en');
  };

  return (
    <button
      onClick={toggleLanguage}
      className="relative flex items-center p-1 rounded-full bg-border/40 border border-border/50 overflow-hidden cursor-pointer"
      aria-label="Toggle language"
    >
      <div className="flex w-16 relative z-10 text-[10px] font-bold tracking-wider uppercase">
        <span className={`flex-1 text-center py-1 transition-colors ${language === 'en' ? 'text-white' : 'text-muted'}`}>EN</span>
        <span className={`flex-1 text-center py-1 transition-colors ${language === 'es' ? 'text-white' : 'text-muted'}`}>ES</span>
      </div>
      
      {/* Animated pill background */}
      <motion.div
        className="absolute top-1 bottom-1 w-8 bg-primary rounded-full shadow-sm"
        animate={{
          left: language === 'en' ? '4px' : '32px',
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      />
    </button>
  );
}
