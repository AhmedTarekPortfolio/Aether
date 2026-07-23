# Aether Component Architecture Conventions

This document outlines the organization and usage guidelines for components within Aether.

---

## Directory Conventions

1. `src/components/ui/`
   - **Purpose**: Generic, highly reusable UI primitives with zero domain knowledge.
   - **Characteristics**: Pure presentational components, accessible keyboard navigation, responsive token styling.
   - **Examples**: `Button`, `Card`, `Badge`, `Modal`, `Tabs`, `Toast`, `Tooltip`, `Dropdown`, `Skeleton`, `EmptyState`, `CommandPalette`.

2. `src/components/layout/`
   - **Purpose**: Global application layout chrome and persistent viewport wrappers.
   - **Characteristics**: Manages top-level layout grid, sidebar navigation drawer, top bar, and theme toggling.
   - **Examples**: `Sidebar`, `TopHeader`.

3. `src/components/common/`
   - **Purpose**: Domain-aware components that are shared across 2 or more views.
   - **Characteristics**: Encapsulates specific domain concepts (e.g. explainable reasoning, global error handling) without being locked to a single view.
   - **Examples**: `ExplainabilityModal`, `ErrorBoundary`.

4. **View-Local Components** (`src/views/`)
   - **Purpose**: Screen-specific composition.
   - **Rule**: View-local helper elements remain inline inside their respective view file (`HomeView.tsx`, `PlanView.tsx`, `WorkspaceView.tsx`, `FocusView.tsx`, `AIAssistantView.tsx`, `InsightsView.tsx`, `SettingsView.tsx`) until they are explicitly needed in a second place.
