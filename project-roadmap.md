# Project Roadmap: Inkstream

This document outlines the planned development phases and tasks to bring Inkstream from its current state to a fully functional, production-ready application.

## Phase 1: MVP - Core Functionality & Stability (Current Focus)

Goal: Ensure all primary features are working reliably end-to-end for a Minimum Viable Product.

### Frontend (React + Vite)

- [x] Basic S3 File Upload with Cognito Authentication (per-user folders).
- [x] Refactor file upload to use `FileProcessingContext`.
- [ ] **Robust File Upload:**
  - [ ] Clear visual feedback for upload progress (consider multipart for large files if SDK supports it well on client-side or use pre-signed URLs with server-side progress tracking).
  - [ ] Comprehensive error handling and display for upload failures.
  - [ ] File type validation and size limits.
- [ ] **Workflow Initiation:**
  - [x] Trigger Step Functions workflow after successful upload.
  - [ ] Display initial confirmation that processing has started.
- [ ] **Workflow Status & Results Display (Iterative Implementation):**
  - [x] **P1.1: Basic Polling & Status Update:** Implement polling in `FileProcessingContext` to fetch workflow status. Display basic status messages (e.g., "Processing", "Success", "Failed") in `S3FileUpload.tsx`.
  - [ ] **P1.2: Display Workflow Output:** Properly display the workflow output in the UI, ensuring complex objects are handled and long strings like ARNs are wrapped or truncated.
  - [ ] **P1.3: Display Basic Results:** Once workflow completes, fetch and display basic results (e.g., extracted text, link to audio). This might involve a new API endpoint or enhancing the status endpoint.
  - [ ] **P1.4: Error Display:** Clearly display errors from the workflow.
- [ ] **Authentication Flow:**
  - [ ] Ensure smooth Google sign-in and sign-out.
  - [ ] Secure handling and storage of authentication tokens (e.g., `id_token` currently from localStorage - review best practices, consider HttpOnly cookies if a backend for frontend is introduced, or ensure proper XSS mitigation).

### Backend (AWS CDK: Lambda, Step Functions, S3, DynamoDB, Cognito, API Gateway)

- [x] Cognito setup with Google Federation and per-user S3 access (`${aws:PrincipalTag/sub}`).
- [x] Basic Step Functions workflow structure.
- [x] API Gateway endpoint for starting the workflow (`/start-workflow`).
- [ ] **API Gateway Endpoints (Iterative Implementation):**
  - [ ] **P1.1: Workflow Status Endpoint (`/workflow-status`):** Create an endpoint that accepts a workflow execution ARN and returns its current status (and potentially basic output/error if available).
  - [ ] **P1.2: (Optional/If Needed) Results Endpoint (`/workflow-results`):** If results are too large or complex for the status endpoint, create a dedicated endpoint to fetch detailed processing results using the execution ARN.
  - [ ] **New: List Workflows Endpoint (`/workflows`):** Create an endpoint to list a user's past and ongoing workflows, including metadata like file name, status, creation date, and S3 paths to generated files. This will likely query DynamoDB.
- [ ] **Step Functions Workflow Enhancement:**
  - [ ] Ensure each step (Textract, Bedrock LLM, Polly) is fully implemented and integrated.
  - [ ] Store generated outputs (formatted text, translated text) to S3 and include their paths in the workflow output.
  - [ ] Robust error handling, retries, and dead-letter queues (DLQs) for each Lambda within the workflow.
  - [ ] Pass necessary data between steps correctly.
  - [ ] Implement idempotency where necessary.
- [ ] **Lambda Functions:**
  - [ ] Optimize Lambda configurations (memory, timeout).
  - [ ] Implement structured logging (e.g., using AWS Lambda Powertools).
  - [ ] Input validation for all Lambda handlers.
- [ ] **API Gateway:**
  - [ ] Secure endpoints (authentication via Cognito Authorizer).
  - [ ] Input validation for API requests.
- [ ] **DynamoDB:**
  - [ ] Finalize schema for storing file metadata, user information, workflow status, workflow parameters, and S3 paths to original and generated files.
  - [ ] Implement efficient querying patterns, especially for the new `List Workflows Endpoint` (e.g., GSI on user ID and timestamp).
- [ ] **S3 Bucket:**
  - [ ] Lifecycle policies for managing stored files (e.g., moving to cheaper storage, deletion).

### General

- [ ] **End-to-End Testing (Iterative Checkpoints):**
  - [ ] **Checkpoint 1 (Current Goal):** Verify file upload, workflow start, and basic status polling. Sign-in -> Upload -> Workflow Starts -> Status updates to "Running".
  - [ ] **Checkpoint 2:** Verify workflow completion (success/failure) and display of basic results/errors. Sign-in -> Upload -> Workflow Runs -> Status updates to "Success/Failed" -> Basic results/error message shown.
  - [ ] **Checkpoint 3 (Full MVP E2E):** Full user flow: Sign-in -> Upload -> Processing (with intermediate status updates) -> View Full Results (text, translation, audio link).
- [ ] **Configuration Management:**
  - [ ] Centralize environment-specific configurations (e.g., API endpoints, Cognito IDs) for frontend and backend.
  - [ ] Ensure `.env` files are correctly used and not committed.

## Phase 2: Enhancements & User Experience

Goal: Improve usability, add polish, and prepare for wider testing.

### Frontend

- [ ] **UI Structure & Navigation:**
  - [ ] Design and implement a clear navigation structure (e.g., sidebar or top navigation bar).
  - [ ] Main Page: Focus on file upload and current/most recent workflow status (refine `S3FileUpload.tsx` or create a dedicated view if needed).
  - [ ] **New: Workflow History Page:**
    - [ ] Create a new page/route for displaying a history of user\'s workflows.
    - [ ] Display workflows in a tabular format (columns: File Name, Upload Date, Status, Options Used, Actions).
    - [ ] For each workflow, show parameters used (e.g., translation language, audio generation choice - once implemented).
    - [ ] Provide download links for: original uploaded file, formatted text, translated text (if applicable), and audio file (if applicable).
    - [ ] Implement pagination or infinite scrolling for long lists of workflows.
- [ ] **Workflow Parameter Selection (Main Page/Upload Component):**
  - [ ] Implement UI for selecting workflow parameters (e.g., translation language, audio generation).
- [ ] **Advanced UI/UX (General):**
  - [ ] Real-time (or near real-time) updates on workflow progress (e.g., using WebSockets, or periodic polling with backoff).
  - [ ] Improved display of processed content (e.g., side-by-side original/translated text, embedded audio player).
  - [ ] User settings/profile page (if needed).
  - [ ] Responsive design for various screen sizes.
- [ ] **Accessibility (a11y):** Implement accessibility best practices.

### Backend

- [ ] **API Enhancements for Workflow History:**
  - [ ] **New: List Workflows Endpoint (`/workflows`):** Create an API endpoint to list a user\'s past and ongoing workflows. This should include metadata like file name, status, creation date, workflow parameters used, and S3 paths to original and generated files. This will likely query DynamoDB.
- [ ] **Data Storage for Workflow History (DynamoDB):**
  - [ ] Update DynamoDB schema to store comprehensive workflow details: file metadata, user information, workflow status, parameters used (e.g., translation language, audio choice), and S3 paths to all relevant files (original, formatted text, translated text, audio).
  - [ ] Implement efficient querying patterns for the `List Workflows Endpoint` (e.g., using a Global Secondary Index on user ID and timestamp).
- [ ] **Monitoring & Alerting:**
  - [ ] Set up CloudWatch Dashboards for key metrics (Lambda invocations, errors, Step Function success/failure rates, API Gateway latency).
  - [ ] Configure CloudWatch Alarms for critical issues.
- [ ] **Cost Optimization:**
  - [ ] Review AWS service usage and identify potential cost savings (e.g., Lambda provisioned concurrency, S3 storage classes, DynamoDB capacity modes).
- [ ] **Scalability:**
  - [ ] Load testing to identify bottlenecks.
  - [ ] Ensure services are configured to scale appropriately.

### General

- [ ] **End-to-End Testing (Iterative Checkpoints):**
  - [ ] **Checkpoint 1 (Current Goal):** Verify file upload, workflow start, and basic status polling. Sign-in -> Upload -> Workflow Starts -> Status updates to "Running".
  - [ ] **Checkpoint 2:** Verify workflow completion (success/failure) and display of basic results/errors. Sign-in -> Upload -> Workflow Runs -> Status updates to "Success/Failed" -> Basic results/error message shown.
  - [ ] **Checkpoint 3 (Full MVP E2E):** Full user flow: Sign-in -> Upload -> Processing (with intermediate status updates) -> View Full Results (text, translation, audio link).
- [ ] **Configuration Management:**
  - [ ] Centralize environment-specific configurations (e.g., API endpoints, Cognito IDs) for frontend and backend.
  - [ ] Ensure `.env` files are correctly used and not committed.

## Phase 3: Testing & Production Readiness

Goal: Ensure the application is robust, secure, and ready for production deployment.

### Testing

- [ ] **Unit Tests:**
  - [ ] Comprehensive unit tests for critical frontend components and utility functions.
  - [ ] Unit tests for all Lambda functions (mocking AWS services).
- [ ] **Integration Tests:**
  - [ ] Test interactions between frontend and backend APIs.
  - [ ] Test Step Functions workflow execution with mock data or real services in a test environment.
- [ ] **End-to-End (E2E) Tests:**
  - [ ] Automate key user flows using a framework like Playwright or Cypress.

### DevOps & Deployment

- [ ] **CI/CD Pipeline:**
  - [ ] Set up automated build, test, and deployment pipelines (e.g., GitHub Actions, AWS CodePipeline).
  - [ ] Separate deployment environments (e.g., `dev`, `staging`, `prod`) managed by CDK.
  - [ ] Automated database schema migrations (if applicable, though DynamoDB is schema-less).
- [ ] **Infrastructure as Code (IaC):**
  - [ ] Regularly review and update CDK stacks.
  - [ ] Parameterize CDK stacks for different environments.

### Security

- [ ] **Security Audit:**
  - [ ] Review IAM policies for least privilege.
  - [ ] Harden Cognito User Pool and Identity Pool settings.
  - [ ] Implement security headers for the frontend.
  - [ ] Consider AWS WAF for API Gateway.
  - [ ] Input validation and output encoding to prevent XSS, SQLi (though less relevant for NoSQL), etc.
  - [ ] Dependency vulnerability scanning (e.g., `npm audit`, Snyk).
- [ ] **Secrets Management:**
  - [ ] Ensure all secrets (API keys, etc.) are managed securely (e.g., AWS Secrets Manager, Parameter Store) and not hardcoded. (Currently using `.env` for Google Client ID/Secret in CDK, which is acceptable for deployment-time config if `.env` is gitignored).

### Documentation

- [ ] **Developer Documentation:**
  - [ ] Update READMEs in each package with detailed setup, development, and deployment instructions.
  - [ ] Document architecture and key design decisions.
- [ ] **User Documentation:** (If applicable for end-users)
  - [ ] Simple guide on how to use the application.

## Phase 4: Post-Launch & Future Features

Goal: Maintain the application, gather feedback, and plan future iterations.

### Operations

- [ ] **Ongoing Monitoring & Maintenance.**
- [ ] **Regular Security Patching and Updates.**
- [ ] **Backup and Disaster Recovery Plan.**

### Future Enhancements (Ideas)

- [ ] Support for more input file types (e.g., DOCX).
- [ ] More LLM options or fine-tuning.
- [ ] Advanced text editing features post-processing.
- [ ] User collaboration features.
- [ ] Admin dashboard for managing users and system health.
- [ ] Internationalization (i18n) and Localization (l10n) for the frontend.

---

This roadmap is a living document and will be updated as the project progresses.
