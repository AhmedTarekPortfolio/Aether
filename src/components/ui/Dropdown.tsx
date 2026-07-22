import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface DropdownOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  action: () => void;
}

interface DropdownProps {
  trigger: React.ReactNode;
  options: DropdownOption[];
  align?: 'left' | 'right';
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  options,
  align = 'right',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 mt-2 w-48 bg-[#111B2E] border border-white/10 rounded-xl shadow-2xl overflow-hidden p-1 ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => {
                  option.action();
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left cursor-pointer ${
                  option.destructive
                    ? 'text-rose-400 hover:bg-rose-500/10'
                    : 'text-slate-200 hover:text-white hover:bg-white/5'
                }`}
              >
                {option.icon && <span className="shrink-0">{option.icon}</span>}
                <span>{option.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
