import React, { createContext, useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { MOTION_PRESETS } from '../../constants/motion';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (title: string, type?: ToastType, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (title: string, type: ToastType = 'info', description?: string) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    const newToast: ToastMessage = { id, title, type, description };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              {...MOTION_PRESETS.toast}
              className="pointer-events-auto p-4 bg-[var(--bg-secondary)] border border-[var(--border-glass-hover)] rounded-2xl shadow-2xl flex items-start gap-3 text-[var(--text-primary)]"
            >
              <div className="mt-0.5 shrink-0">
                {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[var(--accent-emerald)]" />}
                {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-[var(--accent-rose)]" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-[var(--accent-blue)]" />}
                {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-[var(--accent-amber)]" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{toast.title}</div>
                {toast.description && (
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">{toast.description}</p>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--border-glass)] transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
