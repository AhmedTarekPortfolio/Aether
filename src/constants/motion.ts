// Standardized Framer Motion Presets & Easing Tokens

export const MOTION_PRESETS = {
  // Micro-interactions (Buttons, Badges, Cards hover)
  microHover: {
    duration: 0.15,
    ease: [0.16, 1, 0.3, 1],
  },

  // Modal reveal & dialog transitions
  modal: {
    initial: { opacity: 0, scale: 0.95, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 10 },
    transition: { type: 'spring' as const, damping: 25, stiffness: 350 },
  },

  // Backdrop overlay fade
  backdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
  },

  // Toast slide-in
  toast: {
    initial: { opacity: 0, y: 20, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 20, scale: 0.95 },
    transition: { type: 'spring' as const, damping: 20, stiffness: 300 },
  },

  // Tab switching fade-slide
  tabView: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
};
