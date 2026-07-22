import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { MOTION_PRESETS } from '../../constants/motion';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'lg',
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            {...MOTION_PRESETS.backdrop}
            onClick={onClose}
            className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-md"
          />

          {/* Modal Content */}
          <motion.div
            {...MOTION_PRESETS.modal}
            className={`relative w-full ${maxWidthClasses[maxWidth]} bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-glass)] rounded-2xl shadow-2xl overflow-hidden z-10`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-glass)]">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--border-glass)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
