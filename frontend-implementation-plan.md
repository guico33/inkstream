# Inkstream Frontend UI/UX Implementation Plan

## Overview
Transform the current simple file upload interface into a comprehensive workflow management dashboard with real-time progress tracking, file downloads, and workflow history.

## Architecture Decisions

### Technology Stack
- **UI Framework**: React with TypeScript
- **UI Components**: shadcn/ui (already available)
- **Forms**: react-hook-form
- **HTTP Client**: axios (to be added)
- **State Management**: React Query/TanStack Query (to be added)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

### App Structure
- Single-page application with tab organization
- Responsive design (mobile-friendly)
- Real-time updates every 5 seconds
- Toast notifications for workflow events

## 1. Shared Constants & Types

### 1.1 Create Shared Constants Package
**File**: `/packages/shared/src/constants.ts`

```typescript
// Supported languages for translation
export const SUPPORTED_LANGUAGES = [
  { code: 'english', name: 'English' },
  { code: 'spanish', name: 'Spanish' },
  { code: 'french', name: 'French' },
  { code: 'german', name: 'German' },
  { code: 'italian', name: 'Italian' },
  { code: 'portuguese', name: 'Portuguese' },
  { code: 'russian', name: 'Russian' },
  { code: 'chinese', name: 'Chinese (Simplified)' },
  { code: 'japanese', name: 'Japanese' },
  { code: 'korean', name: 'Korean' },
  { code: 'arabic', name: 'Arabic' },
  { code: 'hindi', name: 'Hindi' },
  { code: 'dutch', name: 'Dutch' },
  { code: 'polish', name: 'Polish' },
  { code: 'swedish', name: 'Swedish' },
  { code: 'norwegian', name: 'Norwegian' },
  { code: 'danish', name: 'Danish' },
  { code: 'finnish', name: 'Finnish' },
  { code: 'turkish', name: 'Turkish' },
  { code: 'thai', name: 'Thai' }
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]['code'];

// Workflow polling interval
export const WORKFLOW_POLLING_INTERVAL = 5000; // 5 seconds

// File size limits
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Supported file types
export const SUPPORTED_FILE_TYPES = [
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.jpg',
  '.jpeg',
  '.png'
] as const;
```

### 1.2 Update Shared Package Exports
**File**: `/packages/shared/src/index.ts`

```typescript
export * from './api-types.js';
export * from './workflow-types.js';
export * from './constants.js';
```

## 2. Frontend Dependencies

### 2.1 Install Required Packages
```bash
cd apps/frontend
npm install axios @tanstack/react-query @hookform/resolvers zod sonner
```

### 2.2 Package Dependencies Breakdown
- **axios**: HTTP client for API calls
- **@tanstack/react-query**: Server state management and caching
- **@hookform/resolvers**: Form validation with Zod
- **zod**: Schema validation
- **sonner**: Toast notifications (already in shadcn/ui)

## 3. Application Structure

### 3.1 Page Layout
```
├── Header (with user info, logout)
├── Main Dashboard (Tabs)
│   ├── Tab 1: New Workflow
│   ├── Tab 2: Active Workflows
│   └── Tab 3: Workflow History
└── Toast Notifications
```

### 3.2 Component Hierarchy
```
App
├── Layout
│   ├── Header
│   └── Dashboard
│       ├── WorkflowTabs
│       │   ├── NewWorkflowTab
│       │   │   ├── FileUploadSection
│       │   │   ├── WorkflowParametersForm
│       │   │   └── WorkflowSubmission
│       │   ├── ActiveWorkflowsTab
│       │   │   ├── WorkflowList
│       │   │   └── WorkflowCard (with real-time updates)
│       │   └── HistoryTab
│       │       ├── WorkflowHistory
│       │       └── CompletedWorkflowCard
│       └── Toaster (sonner)
```

## 4. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
1. **Setup React Query & Axios**
   - Configure query client
   - Create API service layer
   - Setup error handling

2. **Create Shared Constants**
   - Language constants
   - Workflow settings
   - File type validation

3. **Basic Dashboard Layout**
   - Header component
   - Tab navigation
   - Responsive layout

### Phase 2: New Workflow Interface (Week 1-2)
1. **Enhanced File Upload**
   - File validation
   - Preview functionality
   - Drag & drop support

2. **Workflow Parameters Form**
   - Translation toggle
   - Language selection
   - Speech conversion toggle
   - Form validation with Zod

3. **Workflow Submission**
   - Progress indicators
   - Error handling
   - Success feedback

### Phase 3: Real-time Workflow Tracking (Week 2)
1. **Active Workflows Tab**
   - Real-time status polling
   - Progress visualization
   - Step-by-step tracking

2. **File Download Integration**
   - Progressive file availability
   - Download buttons per step
   - Download progress

3. **Toast Notifications**
   - File ready notifications
   - Workflow completion alerts
   - Error notifications

### Phase 4: Workflow History (Week 3)
1. **History Tab**
   - Date-grouped workflows
   - Search and filter
   - Pagination (future)

2. **Completed Workflow Cards**
   - Summary information
   - Download all files
   - Workflow details

### Phase 5: Polish & Optimization (Week 3-4)
1. **Mobile Responsiveness**
   - Touch-friendly interactions
   - Responsive layout adjustments
   - Mobile-specific optimizations

2. **Performance Optimization**
   - Query caching strategies
   - Lazy loading
   - Error boundaries

3. **Accessibility**
   - ARIA labels
   - Keyboard navigation
   - Screen reader support

## 5. Detailed Component Specifications

### 5.1 NewWorkflowTab Component
```typescript
interface NewWorkflowTabProps {}

// Features:
// - File upload with validation
// - Workflow parameters form
// - Real-time form validation
// - Submit workflow with loading states
```

### 5.2 WorkflowParametersForm Component
```typescript
interface WorkflowParametersFormProps {
  onSubmit: (params: WorkflowParameters) => void;
  isLoading: boolean;
}

// Features:
// - Translation toggle switch
// - Language dropdown (when translation enabled)
// - Speech conversion toggle
// - Form validation with react-hook-form + Zod
// - Responsive form layout
```

### 5.3 ActiveWorkflowCard Component
```typescript
interface ActiveWorkflowCardProps {
  workflow: WorkflowStatusResponse;
}

// Features:
// - Real-time status updates
// - Progress bar with steps
// - Download buttons (as files become available)
// - Estimated completion time
// - Error states with retry option
```

### 5.4 WorkflowProgressIndicator Component
```typescript
interface WorkflowProgressIndicatorProps {
  status: WorkflowStatus;
  steps: WorkflowStep[];
}

// Features:
// - Visual step progression
// - Current step highlighting
// - Completed steps checkmarks
// - Error step indicators
```

## 6. API Integration Strategy

### 6.1 React Query Setup
```typescript
// Setup query client with optimistic updates
// Configure background refetching
// Error handling and retry logic
// Cache invalidation strategies
```

### 6.2 API Service Layer
```typescript
// Workflow API service
export class WorkflowApiService {
  async startWorkflow(params: StartWorkflowParams): Promise<StartWorkflowResponse>
  async getWorkflowStatus(workflowId: string): Promise<WorkflowStatusResponse>
  async listUserWorkflows(): Promise<WorkflowStatusResponse[]>
}
```

### 6.3 Custom Hooks
```typescript
// useStartWorkflow - Mutation for starting workflows
// useWorkflowStatus - Query for individual workflow status
// useUserWorkflows - Query for user's workflow list
// useWorkflowPolling - Real-time polling hook
```

## 7. State Management

### 7.1 React Query for Server State
- Workflow status caching
- Background updates
- Optimistic updates
- Error state management

### 7.2 Local State with React hooks
- Form state (react-hook-form)
- UI state (tabs, modals)
- Upload progress
- Toast notifications

## 8. User Experience Enhancements

### 8.1 Real-time Updates
- 5-second polling for active workflows
- Smart polling (stop when completed)
- Background tab handling
- Connection status indicators

### 8.2 Progressive File Downloads
- Download buttons appear as files become ready
- File type icons and descriptions
- Download progress indicators
- Bulk download options

### 8.3 Toast Notifications
- File processing milestones
- Download ready notifications
- Error alerts with actions
- Success confirmations

## 9. Responsive Design Strategy

### 9.1 Breakpoints
- Mobile: 320px - 768px
- Tablet: 768px - 1024px
- Desktop: 1024px+

### 9.2 Mobile-Specific Features
- Touch-friendly buttons
- Swipe navigation for tabs
- Optimized file upload interface
- Collapsible workflow details

## 10. Testing Strategy

### 10.1 Component Testing
- React Testing Library
- Mock API responses
- User interaction testing
- Accessibility testing

### 10.2 Integration Testing
- Workflow end-to-end flows
- Real-time update testing
- File download testing
- Error scenario testing

## 11. Implementation Timeline

### Week 1: Foundation
- [ ] Setup React Query & Axios
- [ ] Create shared constants
- [ ] Build dashboard layout
- [ ] Implement new workflow tab

### Week 2: Core Features
- [ ] Workflow parameters form
- [ ] Real-time status tracking
- [ ] File download integration
- [ ] Toast notifications

### Week 3: History & Polish
- [ ] Workflow history tab
- [ ] Mobile responsiveness
- [ ] Performance optimization
- [ ] Error handling improvements

### Week 4: Testing & Refinement
- [ ] Comprehensive testing
- [ ] Accessibility improvements
- [ ] Documentation
- [ ] Final polish

## 12. Future Enhancements (Post-MVP)

### 12.1 Advanced Features
- Workflow templates
- Batch processing
- File sharing
- Advanced filtering

### 12.2 Performance
- Virtual scrolling for large lists
- Progressive loading
- Offline support
- Background sync

### 12.3 User Experience
- Keyboard shortcuts
- Drag & drop reordering
- Workflow scheduling
- Email notifications

## 13. Technical Considerations

### 13.1 Performance
- React.memo for expensive components
- useMemo for computed values
- useCallback for stable references
- Code splitting for large components

### 13.2 Error Handling
- Error boundaries for component failures
- Graceful API error handling
- Retry mechanisms with exponential backoff
- User-friendly error messages

### 13.3 Security
- Input validation on frontend
- Secure file upload handling
- XSS prevention
- CSRF protection

This implementation plan provides a comprehensive roadmap for transforming the Inkstream frontend into a professional workflow management application while maintaining simplicity and usability.
