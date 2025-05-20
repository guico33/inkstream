# Project Roadmap: Inkstream

This document outlines the planned development phases and tasks to bring Inkstream from its current state to a fully functional, production-ready application.

## Phase 1: MVP - Core Functionality & Stability (Current Focus)

Goal: Ensure all primary features are working reliably end-to-end for a Minimum Viable Product.

### Frontend (React + Vite)

- [x] Basic S3 File Upload with Cognito Authentication (per-user folders).
- [ ] **Robust File Upload:**
  - [ ] Clear visual feedback for upload progress (consider multipart for large files if SDK supports it well on client-side or use pre-signed URLs with server-side progress tracking).
  - [ ] Comprehensive error handling and display for upload failures.
  - [ ] File type validation and size limits.
- [ ] **Workflow Initiation:**
  - [ ] Trigger Step Functions workflow after successful upload.
  - [ ] Display initial confirmation that processing has started.
- [ ] **Results Display:**
  - [ ] Basic display of extracted text, translated text, and link to audio file.
  - [ ] Mechanism to poll or receive updates on workflow status.
- [ ] **Authentication Flow:**
  - [ ] Ensure smooth Google sign-in and sign-out.
  - [ ] Secure handling and storage of authentication tokens (e.g., `id_token` currently from localStorage - review best practices, consider HttpOnly cookies if a backend for frontend is introduced, or ensure proper XSS mitigation).

### Backend (AWS CDK: Lambda, Step Functions, S3, DynamoDB, Cognito, API Gateway)

- [x] Cognito setup with Google Federation and per-user S3 access (`${aws:PrincipalTag/sub}`).
- [x] Basic Step Functions workflow structure.
- [ ] **Step Functions Workflow Enhancement:**
  - [ ] Ensure each step (Textract, Bedrock LLM, Polly) is fully implemented and integrated.
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
  - [ ] Finalize schema for storing file metadata, user information, and workflow status.
  - [ ] Implement efficient querying patterns.
- [ ] **S3 Bucket:**
  - [ ] Lifecycle policies for managing stored files (e.g., moving to cheaper storage, deletion).

### General

- [ ] **End-to-End Testing:** Manually test the full user flow: Sign-in -> Upload -> Processing -> View Results.
- [ ] **Configuration Management:**
  - [ ] Centralize environment-specific configurations (e.g., API endpoints, Cognito IDs) for frontend and backend.
  - [ ] Ensure `.env` files are correctly used and not committed.

## Phase 2: Enhancements & User Experience

Goal: Improve usability, add polish, and prepare for wider testing.

### Frontend

- [ ] **Advanced UI/UX:**
  - [ ] Dashboard to view history of uploaded/processed files.
  - [ ] Real-time (or near real-time) updates on workflow progress (e.g., using WebSockets, or periodic polling with backoff).
  - [ ] Improved display of processed content (e.g., side-by-side original/translated text, embedded audio player).
  - [ ] User settings/profile page (if needed).
  - [ ] Responsive design for various screen sizes.
- [ ] **Accessibility (a11y):** Implement accessibility best practices.

### Backend

- [ ] **Monitoring & Alerting:**
  - [ ] Set up CloudWatch Dashboards for key metrics (Lambda invocations, errors, Step Function success/failure rates, API Gateway latency).
  - [ ] Configure CloudWatch Alarms for critical issues.
- [ ] **Cost Optimization:**
  - [ ] Review AWS service usage and identify potential cost savings (e.g., Lambda provisioned concurrency, S3 storage classes, DynamoDB capacity modes).
- [ ] **Scalability:**
  - [ ] Load testing to identify bottlenecks.
  - [ ] Ensure services are configured to scale appropriately.

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
